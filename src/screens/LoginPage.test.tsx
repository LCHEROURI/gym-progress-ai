// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const signIn = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../auth/useAuthSession", () => ({
  useAuthSession: () => ({
    user: null,
    state: "ready",
    error: null,
    signIn,
    signOut: vi.fn(),
  }),
}));

import LoginPage from "./LoginPage";

describe("LoginPage", () => {
  it("offers Google sign-in", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  it("calls signIn and shows busy state", async () => {
    let resolve!: () => void;
    signIn.mockImplementationOnce(
      () => new Promise<void>((r) => { resolve = r; }),
    );
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(signIn).toHaveBeenCalledOnce();
    resolve();
  });

  it("shows the mapped message when sign-in fails", async () => {
    signIn.mockRejectedValueOnce(new Error("Sign-in was cancelled."));
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign-in was cancelled.");
  });
});
