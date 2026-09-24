// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  current: null as ((u: unknown) => void) | null,
}));
vi.mock("firebase/auth", () => ({
  getAuth: () => ({}),
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => {
    authState.current = cb;
    return () => {};
  },
  signInWithPopup: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  GoogleAuthProvider: class {},
}));
vi.mock("../data/firebase", () => ({ initFirebase: () => ({ auth: {}, db: {} }) }));

import { useAuthSession } from "./useAuthSession";

beforeEach(() => {
  authState.current = null;
});

describe("useAuthSession", () => {
  it("settles to ready with the user", async () => {
    const { result } = renderHook(() => useAuthSession());
    expect(result.current.state).toBe("loading");
    act(() => authState.current?.({ uid: "u1", email: "e@x" }));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.user?.uid).toBe("u1");
  });

  it("settles to ready with null user when signed out", async () => {
    const { result } = renderHook(() => useAuthSession());
    act(() => authState.current?.(null));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.user).toBeNull();
  });

  it("signIn surfaces mapped copy on auth/popup-closed-by-user", async () => {
    const { signInWithPopup } = await import("firebase/auth");
    vi.mocked(signInWithPopup).mockRejectedValueOnce({
      code: "auth/popup-closed-by-user",
    });
    const { result } = renderHook(() => useAuthSession());
    await act(async () => {
      await expect(result.current.signIn()).rejects.toThrow("Sign-in was cancelled.");
    });
  });
});
