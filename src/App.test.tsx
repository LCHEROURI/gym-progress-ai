// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authSession = vi.hoisted(() => ({
  user: null as { uid: string; email: string | null } | null,
  state: "ready" as "loading" | "ready" | "error",
  error: null as string | null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  retry: vi.fn(),
}));

vi.mock("./auth/useAuthSession", () => ({
  useAuthSession: () => authSession,
}));

import App from "./App";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1";

function stubIphoneSafari() {
  vi.stubGlobal("navigator", {
    userAgent: IPHONE_SAFARI,
    platform: "iPhone",
    maxTouchPoints: 5,
    standalone: false,
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
  }));
}

beforeEach(() => {
  localStorage.clear();
  authSession.user = null;
  authSession.state = "ready";
  authSession.error = null;
  authSession.retry.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("App", () => {
  it("renders the app heading and sign-in for signed-out users", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Gym Progress AI");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  it("shows an actionable retry when auth initialization fails", () => {
    authSession.state = "error";
    authSession.error = "Could not reach sign-in. Check your connection and try again.";
    render(<App />);

    expect(screen.getByRole("heading", { name: "Sign-in unavailable" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Check your connection and try again.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(authSession.retry).toHaveBeenCalledOnce();
  });

  it("shows the one-time iOS install nudge before login", () => {
    stubIphoneSafari();
    render(<App />);
    expect(screen.getByRole("note", { name: "Install app" })).toHaveTextContent(
      /Add to Home Screen/,
    );
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  it("keeps the pre-login nudge hidden once dismissed (same flag as TODAY)", () => {
    stubIphoneSafari();
    localStorage.setItem("gpa-install-nudge-dismissed", "1");
    render(<App />);
    expect(screen.queryByRole("note")).toBeNull();
  });
});
