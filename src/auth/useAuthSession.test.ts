// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  current: null as ((u: unknown) => void) | null,
}));
const authSdkMocks = vi.hoisted(() => ({
  signInWithPopup: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
}));
vi.mock("../data/firebase", () => ({
  initAuth: vi.fn(() =>
    Promise.resolve({
      auth: {},
      app: {},
      observeAuthState: (onUser: (user: unknown) => void) => {
        authState.current = onUser;
        return () => {};
      },
      signIn: authSdkMocks.signInWithPopup,
      signOut: authSdkMocks.signOut,
    }),
  ),
}));
vi.mock("../shared/env", () => ({ parseEnv: () => ({}) }));

import { initAuth } from "../data/firebase";
import { useAuthSession } from "./useAuthSession";

beforeEach(() => {
  authState.current = null;
  vi.mocked(initAuth).mockClear();
});

describe("useAuthSession", () => {
  it("settles to ready with the user", async () => {
    const { result } = renderHook(() => useAuthSession());
    expect(result.current.state).toBe("loading");
    await waitFor(() => expect(authState.current).toBeTypeOf("function"));
    act(() => authState.current?.({ uid: "u1", email: "e@x" }));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.user?.uid).toBe("u1");
  });

  it("settles to ready with null user when signed out", async () => {
    const { result } = renderHook(() => useAuthSession());
    await waitFor(() => expect(authState.current).toBeTypeOf("function"));
    act(() => authState.current?.(null));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.user).toBeNull();
  });

  it("retries auth initialization after a temporary failure", async () => {
    vi.mocked(initAuth).mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useAuthSession());

    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error).toMatch(/Check your connection/);

    act(() => result.current.retry());
    await waitFor(() => expect(authState.current).toBeTypeOf("function"));
    act(() => authState.current?.(null));

    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(initAuth).toHaveBeenCalledTimes(2);
  });

  it("signIn surfaces mapped copy on auth/popup-closed-by-user", async () => {
    authSdkMocks.signInWithPopup.mockRejectedValueOnce({
      code: "auth/popup-closed-by-user",
    });
    const { result } = renderHook(() => useAuthSession());
    await act(async () => {
      await expect(result.current.signIn()).rejects.toThrow("Sign-in was cancelled.");
    });
  });
});
