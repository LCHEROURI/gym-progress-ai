// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth/useAuthSession", () => ({
  useAuthSession: () => ({
    user: null,
    state: "ready",
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
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

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("App", () => {
  it("renders the app heading and sign-in for signed-out users", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Gym Progress AI");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
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
