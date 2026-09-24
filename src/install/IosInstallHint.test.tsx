// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import IosInstallHint from "./IosInstallHint";
import { shouldShowIosInstallHint, type InstallEnv } from "./iosSafari";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

function env(overrides: Partial<InstallEnv> = {}): InstallEnv {
  return {
    userAgent: IPHONE_SAFARI,
    platform: "iPhone",
    maxTouchPoints: 5,
    standalone: false,
    ...overrides,
  };
}

function stubBrowser(e: InstallEnv) {
  vi.stubGlobal("navigator", {
    userAgent: e.userAgent,
    platform: e.platform,
    maxTouchPoints: e.maxTouchPoints,
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: e.standalone && query.includes("standalone"),
    media: query,
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("shouldShowIosInstallHint", () => {
  it("shows on iPhone Safari and iPad desktop-class Safari", () => {
    expect(shouldShowIosInstallHint(env())).toBe(true);
    expect(
      shouldShowIosInstallHint(
        env({ userAgent: IPAD_DESKTOP_SAFARI, platform: "MacIntel" }),
      ),
    ).toBe(true);
  });

  it("stays hidden on iOS Chrome, Android, and once installed", () => {
    expect(shouldShowIosInstallHint(env({ userAgent: IPHONE_CHROME }))).toBe(
      false,
    );
    expect(
      shouldShowIosInstallHint(
        env({ userAgent: ANDROID_CHROME, platform: "Linux armv81" }),
      ),
    ).toBe(false);
    expect(shouldShowIosInstallHint(env({ standalone: true }))).toBe(false);
  });
});

describe("IosInstallHint", () => {
  it("renders the Add to Home Screen steps on iPhone Safari", () => {
    stubBrowser(env());
    render(<IosInstallHint />);
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });

  it("renders nothing on Android", () => {
    stubBrowser(env({ userAgent: ANDROID_CHROME, platform: "Linux armv81" }));
    render(<IosInstallHint />);
    expect(screen.queryByText(/Add to Home Screen/)).toBeNull();
  });

  it("renders nothing once running from the Home Screen", () => {
    stubBrowser(env({ standalone: true }));
    render(<IosInstallHint />);
    expect(screen.queryByText(/Add to Home Screen/)).toBeNull();
  });
});
