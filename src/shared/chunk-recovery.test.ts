import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attemptChunkRecovery,
  CHUNK_RELOAD_KEY,
  clearChunkRecovery,
  looksLikeChunkFailure,
  resetChunkRecoveryForTests,
} from "./chunk-recovery";

/** Minimal sessionStorage stand-in; `null` simulates unavailable storage. */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    get size() {
      return map.size;
    },
    raw: map,
  };
}

const CHUNK_ERROR =
  'Failed to fetch dynamically imported module: https://app.test/assets/WorkoutFlow-oldhash.js';

beforeEach(() => resetChunkRecoveryForTests());

describe("looksLikeChunkFailure", () => {
  it("matches the real messages browsers produce", () => {
    const messages = [
      CHUNK_ERROR, // Chromium / Vite
      "error loading dynamically imported module: https://app.test/assets/index-a.js", // Firefox
      "Importing a module script failed.", // Safari
      'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".', // the deploy race
      "Unable to preload CSS for /assets/index-a.css",
      "error loading chunk 42",
      "Loading chunk 7 failed.",
    ];
    for (const message of messages) {
      expect(looksLikeChunkFailure(message), message).toBe(true);
    }
  });

  it("does not match unrelated failures", () => {
    const messages = [
      "Could not reach sign-in. Check your connection and try again.",
      "Google sign-in is not enabled in this Firebase project",
      "Firestore permission denied",
      "render failed",
      "Network request failed",
      "",
    ];
    for (const message of messages) {
      expect(looksLikeChunkFailure(message), message).toBe(false);
    }
  });

  it("rejects non-strings without throwing", () => {
    expect(looksLikeChunkFailure(undefined)).toBe(false);
    expect(looksLikeChunkFailure(null)).toBe(false);
    expect(looksLikeChunkFailure(new Error(CHUNK_ERROR))).toBe(false);
    expect(looksLikeChunkFailure(42)).toBe(false);
  });
});

describe("attemptChunkRecovery — one reload per session", () => {
  it("reloads the first time a chunk fails", () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    expect(attemptChunkRecovery(CHUNK_ERROR, { storage, reload })).toBe("reloading");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does not reload a second time — the loop guard", () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    attemptChunkRecovery(CHUNK_ERROR, { storage, reload });
    // A second failure in the same document, e.g. two crashing screens.
    expect(attemptChunkRecovery(CHUNK_ERROR, { storage, reload })).toBe("already-tried");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does not reload when a previous document already spent the attempt", () => {
    // This is the real-world case: the page reloaded, the shell is still
    // stale, and the same chunk fails again.
    const storage = fakeStorage({ [CHUNK_RELOAD_KEY]: JSON.stringify({ at: 1 }) });
    const reload = vi.fn();
    expect(attemptChunkRecovery(CHUNK_ERROR, { storage, reload })).toBe("already-tried");
    expect(reload).not.toHaveBeenCalled();
  });

  it("ignores a second failure of a *different* chunk too", () => {
    // Deliberately strict: alternation between two broken chunks must not be
    // able to drive a reload loop.
    const storage = fakeStorage();
    const reload = vi.fn();
    attemptChunkRecovery(CHUNK_ERROR, { storage, reload });
    expect(attemptChunkRecovery("Failed to fetch dynamically imported module: other.js", { storage, reload })).toBe(
      "already-tried",
    );
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does nothing for an unrelated error", () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    expect(attemptChunkRecovery("Firestore permission denied", { storage, reload })).toBe(
      "not-a-chunk-failure",
    );
    expect(reload).not.toHaveBeenCalled();
    expect(storage.size).toBe(0);
  });

  it("marks the attempt before reloading, so a blocked reload cannot loop", () => {
    const storage = fakeStorage();
    const reload = vi.fn(() => {
      throw new Error("navigation blocked");
    });
    expect(attemptChunkRecovery(CHUNK_ERROR, { storage, reload })).toBe("unavailable");
    // The marker is still spent: a later attempt must not reload again.
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBeTruthy();
    expect(attemptChunkRecovery(CHUNK_ERROR, { storage, reload })).toBe("already-tried");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("still allows exactly one reload when storage is unavailable", () => {
    const reload = vi.fn();
    expect(attemptChunkRecovery(CHUNK_ERROR, { storage: null, reload })).toBe("reloading");
    expect(attemptChunkRecovery(CHUNK_ERROR, { storage: null, reload })).toBe("already-tried");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("survives storage that throws on every call", () => {
    const hostile = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const reload = vi.fn();
    expect(attemptChunkRecovery(CHUNK_ERROR, { storage: hostile, reload })).toBe("reloading");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("records a truncated reason, not an unbounded error string", () => {
    const storage = fakeStorage();
    attemptChunkRecovery(`Failed to fetch dynamically imported module: ${"x".repeat(5000)}`, {
      storage,
      reload: vi.fn(),
    });
    const stored = storage.getItem(CHUNK_RELOAD_KEY) ?? "";
    expect(stored.length).toBeLessThanOrEqual(300);
  });
});

describe("clearChunkRecovery — a healthy build earns a fresh attempt", () => {
  it("clears the session marker and re-arms the guard", () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    attemptChunkRecovery(CHUNK_ERROR, { storage, reload });
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBeTruthy();

    clearChunkRecovery({ storage });
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBeNull();

    expect(attemptChunkRecovery(CHUNK_ERROR, { storage, reload })).toBe("reloading");
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not throw when storage refuses to clear", () => {
    expect(() =>
      clearChunkRecovery({
        storage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {
            throw new Error("blocked");
          },
        },
      }),
    ).not.toThrow();
  });
});
