/**
 * Wiring, not behavior: that App Check is initialized on the boot path, and
 * that it happens before anything that talks to the network. A test that only
 * exercises `initAppCheck` in isolation would stay green if the call were
 * deleted from `initAuth` — which is the same class of bug as the docs drift
 * this suite's sibling (tests/docs-claims.test.ts) exists to prevent.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const initAppCheck = vi.fn(async () => "active" as const);
vi.mock("../src/data/app-check", () => ({
  initAppCheck: (...args: unknown[]) => initAppCheck(...(args as [])),
  appCheckStatus: () => "active",
}));

vi.mock("firebase/app", () => ({
  getApps: () => [],
  initializeApp: (options: unknown) => ({ name: "app", options }),
}));
vi.mock("firebase/auth", () => ({
  getAuth: () => ({ name: "auth" }),
  onAuthStateChanged: () => () => {},
  connectAuthEmulator: () => {},
  signInWithPopup: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  GoogleAuthProvider: class {},
}));

const firebaseSource = readFileSync("src/data/firebase.ts", "utf8");

describe("App Check wiring", () => {
  it("initializes App Check from initAuth, the one path every session takes", async () => {
    const { initAuth } = await import("../src/data/firebase");
    const { parseEnv } = await import("../src/shared/env");
    initAppCheck.mockClear();

    await initAuth(
      parseEnv({
        VITE_FIREBASE_API_KEY: "k",
        VITE_FIREBASE_AUTH_DOMAIN: "a.example",
        VITE_FIREBASE_PROJECT_ID: "gym-progress-ai-lcherouri",
        VITE_FIREBASE_STORAGE_BUCKET: "b",
        VITE_FIREBASE_MESSAGING_SENDER_ID: "1",
        VITE_FIREBASE_APP_ID: "app",
        VITE_APP_CHECK_SITE_KEY: "site-key",
        VITE_USE_EMULATOR: "0",
      }),
    );

    expect(initAppCheck).toHaveBeenCalledTimes(1);
  });

  it("awaits App Check before Auth is constructed, so tokens exist first", () => {
    // The token is attached at request time. A Firestore instance created
    // before initialization finishes costs one rejected request, and an Auth
    // instance likewise — so ordering is a correctness concern, not a style one.
    const appCheckAt = firebaseSource.indexOf("await initAppCheck(app, env)");
    const authAt = firebaseSource.indexOf("authSdk.getAuth(app)");
    expect(appCheckAt).toBeGreaterThan(-1);
    expect(authAt).toBeGreaterThan(-1);
    expect(appCheckAt).toBeLessThan(authAt);
  });
});

describe("/__boot App Check carve-out", () => {
  const functionsSource = readFileSync("functions/src/index.ts", "utf8");
  const fnStart = functionsSource.indexOf("export const reportBootFailure");
  const doc = functionsSource.slice(Math.max(0, fnStart - 2000), fnStart);
  const options = functionsSource.slice(fnStart, fnStart + 400);

  it("cannot set enforceAppCheck, because onRequest does not accept it", () => {
    // Worth pinning: `enforceAppCheck` is a CallableOptions field, and
    // HttpsOptions Omits it. Writing it here is a typecheck error, so this
    // asserts the platform fact rather than a choice we could have made.
    expect(functionsSource).toContain("onRequest(");
    expect(options).not.toContain("enforceAppCheck");
  });

  it("explains why the pre-React probe cannot present a token", () => {
    expect(doc).toMatch(/cannot (import|hold)/i);
    expect(doc).toMatch(/poisoned-chunk|MIME/);
  });

  it("names the controls that do apply to an unenforced endpoint", () => {
    // The point of documenting the carve-out is that something replaces it.
    expect(doc).toMatch(/dedupe/i);
    expect(doc).toMatch(/Zod|length cap/i);
  });
});
