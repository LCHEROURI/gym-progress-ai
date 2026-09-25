// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => vi.useRealTimers());

describe("LoginPage", () => {
  it("previews the actual scheduled workout on training days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T09:00:00")); // Monday
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: "Strength + Bike" })).toBeInTheDocument();
    expect(screen.getByText("MONDAY · YOUR PLAN")).toBeInTheDocument();
    expect(screen.getByText("Bike Warm-up")).toBeInTheDocument();
    expect(screen.getByText("Leg Press")).toBeInTheDocument();
    expect(screen.getAllByText("2 × 10")).toHaveLength(3);
  });

  it.each([
    ["2026-09-22T09:00:00", "TUESDAY", "Wednesday · Balance + Strength"],
    ["2026-09-24T09:00:00", "THURSDAY", "Friday · Full Body + Walk"],
    ["2026-09-26T09:00:00", "SATURDAY", "Monday · Strength + Bike"],
    ["2026-09-27T09:00:00", "SUNDAY", "Monday · Strength + Bike"],
  ])("shows the next actual training day from %s", (date, weekday, nextSession) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(date));
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: "Recovery day" })).toBeInTheDocument();
    expect(screen.getByText(`${weekday} · RECOVERY DAY`)).toBeInTheDocument();
    expect(screen.getByText(`Next session: ${nextSession}`)).toBeInTheDocument();
  });

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
    await act(async () => {
      resolve();
    });
  });

  it("shows the mapped message when sign-in fails", async () => {
    signIn.mockRejectedValueOnce(new Error("Sign-in was cancelled."));
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign-in was cancelled.");
  });
});
