// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import IosInstallHint from "./IosInstallHint";
import {
  detectIosBrowser,
  shouldShowIosInstallHint,
  type InstallEnv,
} from "./iosBrowser";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1";
const IPHONE_FIREFOX =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15";
const IPHONE_EDGE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/141.0.0.0 Mobile/15E148 Safari/605.1.15";
const IPHONE_OPERA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) OPiOS/18.0.0.0 Mobile/15E148 Safari/9537.53";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

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

function hintText(): string {
  return screen.getByText(/Add to Home Screen/).textContent ?? "";
}

describe("detectIosBrowser", () => {
  it("detects Safari, Chrome, Firefox, and Edge on iPhone", () => {
    expect(detectIosBrowser(env())).toBe("safari");
    expect(
      detectIosBrowser(
        env({ userAgent: IPAD_DESKTOP_SAFARI, platform: "MacIntel" }),
      ),
    ).toBe("safari");
    expect(detectIosBrowser(env({ userAgent: IPHONE_CHROME }))).toBe("chrome");
    expect(detectIosBrowser(env({ userAgent: IPHONE_FIREFOX }))).toBe(
      "firefox",
    );
    expect(detectIosBrowser(env({ userAgent: IPHONE_EDGE }))).toBe("edge");
  });

  it("falls back to generic for Opera and webviews, null off iOS", () => {
    expect(detectIosBrowser(env({ userAgent: IPHONE_OPERA }))).toBe("other");
    expect(
      detectIosBrowser(
        env({ userAgent: ANDROID_CHROME, platform: "Linux armv81" }),
      ),
    ).toBeNull();
  });
});

describe("shouldShowIosInstallHint", () => {
  it("shows for every iOS browser but not standalone or off iOS", () => {
    expect(shouldShowIosInstallHint(env({ userAgent: IPHONE_CHROME }))).toBe(
      true,
    );
    expect(shouldShowIosInstallHint(env({ userAgent: IPHONE_FIREFOX }))).toBe(
      true,
    );
    expect(shouldShowIosInstallHint(env({ standalone: true }))).toBe(false);
    expect(
      shouldShowIosInstallHint(
        env({ userAgent: ANDROID_CHROME, platform: "Linux armv81" }),
      ),
    ).toBe(false);
  });
});

describe("IosInstallHint", () => {
  it("words the steps for Safari, with the Edit Actions fallback", () => {
    stubBrowser(env());
    render(<IosInstallHint />);
    expect(screen.getByText(/tap the Share button/)).toBeInTheDocument();
    expect(screen.getByText(/Edit Actions/)).toBeInTheDocument();
  });

  it("words the steps for Chrome", () => {
    stubBrowser(env({ userAgent: IPHONE_CHROME }));
    render(<IosInstallHint />);
    expect(screen.getByText(/right of the address bar/)).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByText(/Edit Actions/)).toBeNull();
  });

  it("words the steps for Firefox", () => {
    stubBrowser(env({ userAgent: IPHONE_FIREFOX }));
    render(<IosInstallHint />);
    expect(screen.getByText(/☰ menu, then Share/)).toBeInTheDocument();
  });

  it("words the steps for Edge", () => {
    stubBrowser(env({ userAgent: IPHONE_EDGE }));
    render(<IosInstallHint />);
    expect(screen.getByText(/box with an arrow/)).toBeInTheDocument();
  });

  it("uses generic wording for other iOS browsers", () => {
    stubBrowser(env({ userAgent: IPHONE_OPERA }));
    render(<IosInstallHint />);
    expect(screen.getByText(/open Share, then tap/)).toBeInTheDocument();
    expect(screen.getByText(/choose “Web App” if asked/)).toBeInTheDocument();
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

// Locked copy assertions — the strings below are the labels a user sees in the
// real iOS UI: the share-sheet action "Add to Home Screen", the iOS 26 install
// choice "Web App", and Safari's "Edit Actions" fallback for the missing-option
// quirk. Source: Apple iPhone user guide ("Turn a website into an app in Safari
// on iPhone" and "Bookmark a website in Safari on iPhone"), verified 2026-09-24
// on iOS 26. Re-verify at every iOS major version (next: iOS 27) and change
// this lock only when the OS UI changes (docs/PRINCIPLES.md, 2026-09-24).
describe("iOS share-sheet wording (locked)", () => {
  const CASES: [string, string][] = [
    ["Safari", IPHONE_SAFARI],
    ["Chrome", IPHONE_CHROME],
    ["Firefox", IPHONE_FIREFOX],
    ["Edge", IPHONE_EDGE],
  ];

  for (const [name, ua] of CASES) {
    it(`${name} hint names the iOS share-sheet action exactly`, () => {
      stubBrowser(env({ userAgent: ua }));
      render(<IosInstallHint />);
      const text = hintText();
      expect(text).toContain("“Add to Home Screen”");
      expect(text).toContain("“Web App”");
      expect(text).toContain("then Add");
    });
  }

  it("keeps the Safari Edit Actions fallback for the missing-option quirk", () => {
    stubBrowser(env());
    render(<IosInstallHint />);
    expect(hintText()).toContain("Edit Actions");
  });

  it("renders the device language's verified label (French)", () => {
    stubBrowser(env());
    vi.stubGlobal("navigator", {
      userAgent: IPHONE_SAFARI,
      platform: "iPhone",
      maxTouchPoints: 5,
      languages: ["fr-FR"],
    });
    render(<IosInstallHint />);
    const hint = screen.getByText(/Sur l’écran d’accueil/);
    expect(hint).toHaveTextContent("« Sur l’écran d’accueil »");
  });
});
