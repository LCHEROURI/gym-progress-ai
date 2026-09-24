// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IosNudgeBanner from "./IosNudgeBanner";

const mocks = vi.hoisted(() => ({
  trackInstallEvent: vi.fn(),
}));

vi.mock("./install-analytics", () => ({
  trackInstallEvent: mocks.trackInstallEvent,
}));

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1";

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

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
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

  it("opens the full per-browser install steps in a sheet from the nudge text", () => {
    stubBrowser();
    render(<IosNudgeBanner />);
    fireEvent.click(screen.getByRole("button", { name: /Get the app/ }));
    const sheet = screen.getByRole("dialog", { name: "Install app" });
    expect(sheet).toHaveTextContent(/tap the Share button/);
    expect(sheet).toHaveTextContent(/Edit Actions/);
    expect(sheet).toHaveTextContent(
      "The app opens full screen from your Home Screen.",
    );
  });

  it("words the sheet steps for the actual browser (Chrome on iOS)", () => {
    stubBrowser({ userAgent: IPHONE_CHROME });
    render(<IosNudgeBanner />);
    fireEvent.click(screen.getByRole("button", { name: /Get the app/ }));
    expect(screen.getByRole("dialog", { name: "Install app" })).toHaveTextContent(
      /right of the address bar/,
    );
  });

  it("closes the sheet without dismissing the nudge", () => {
    stubBrowser();
    render(<IosNudgeBanner />);
    fireEvent.click(screen.getByRole("button", { name: /Get the app/ }));
    fireEvent.click(screen.getByRole("button", { name: "CLOSE" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("note", { name: "Install app" })).toBeVisible();
  });

  it("closes the sheet with Escape", () => {
    stubBrowser();
    render(<IosNudgeBanner />);
    fireEvent.click(screen.getByRole("button", { name: /Get the app/ }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("records nudge_shown when displayed, nothing off iOS", () => {
    stubBrowser();
    const { unmount } = render(<IosNudgeBanner />);
    expect(mocks.trackInstallEvent).toHaveBeenCalledWith({ type: "nudge_shown" });
    unmount();
    vi.clearAllMocks();
    stubBrowser({ userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/141.0.0.0" });
    render(<IosNudgeBanner />);
    expect(mocks.trackInstallEvent).not.toHaveBeenCalled();
  });

  it("records nudge_dismissed only on DISMISS, not on sheet close", () => {
    stubBrowser();
    render(<IosNudgeBanner />);
    fireEvent.click(screen.getByRole("button", { name: /Get the app/ }));
    fireEvent.click(screen.getByRole("button", { name: "CLOSE" }));
    expect(mocks.trackInstallEvent).not.toHaveBeenCalledWith({
      type: "nudge_dismissed",
    });
    fireEvent.click(screen.getByRole("button", { name: "DISMISS" }));
    expect(mocks.trackInstallEvent).toHaveBeenCalledWith({
      type: "nudge_dismissed",
    });
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
