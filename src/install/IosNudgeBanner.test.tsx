// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IosNudgeBanner from "./IosNudgeBanner";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1";

function stubBrowser(opts: { userAgent?: string; standalone?: boolean; appleStandalone?: boolean } = {}) {
  vi.stubGlobal("navigator", {
    userAgent: opts.userAgent ?? IPHONE_SAFARI,
    platform: "iPhone",
    maxTouchPoints: 5,
    standalone: opts.appleStandalone ?? false,
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: !!opts.standalone && query.includes("standalone"),
    media: query,
  }));
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("IosNudgeBanner", () => {
  it("nudges iOS visitors once with the Share steps", () => {
    stubBrowser();
    render(<IosNudgeBanner />);
    const note = screen.getByRole("note", { name: "Install app" });
    expect(note).toHaveTextContent(/open Share and tap “Add to Home Screen”, then Add/);
  });

  it("stays hidden off iOS and when storage is unavailable", () => {
    stubBrowser({ userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/141.0.0.0" });
    render(<IosNudgeBanner />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("stays hidden once installed (standalone or Home Screen mode)", () => {
    stubBrowser({ standalone: true });
    const { unmount } = render(<IosNudgeBanner />);
    expect(screen.queryByRole("note")).toBeNull();
    unmount();
    vi.unstubAllGlobals();
    stubBrowser({ appleStandalone: true });
    render(<IosNudgeBanner />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("translates the nudge to the device language (French)", () => {
    stubBrowser();
    vi.stubGlobal("navigator", {
      userAgent: IPHONE_SAFARI,
      platform: "iPhone",
      maxTouchPoints: 5,
      standalone: false,
      languages: ["fr-FR"],
    });
    render(<IosNudgeBanner />);
    expect(screen.getByRole("note")).toHaveTextContent("« Sur l’écran d’accueil »");
    expect(screen.getByRole("button", { name: "IGNORER" })).toBeEnabled();
  });

  it("dismisses for good across renders", () => {
    stubBrowser();
    const { unmount } = render(<IosNudgeBanner />);
    fireEvent.click(screen.getByRole("button", { name: "DISMISS" }));
    expect(screen.queryByRole("note")).toBeNull();
    unmount();
    render(<IosNudgeBanner />);
    expect(screen.queryByRole("note")).toBeNull();
  });
});
