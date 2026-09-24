// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InstallSection from "./InstallSection";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function stubEnv(
  opts: {
    userAgent?: string;
    standalone?: boolean;
    appleStandalone?: boolean;
  } = {},
) {
  vi.stubGlobal("navigator", {
    userAgent: opts.userAgent ?? DESKTOP_CHROME,
    platform: "Win32",
    maxTouchPoints: 0,
    standalone: opts.appleStandalone ?? false,
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: !!opts.standalone && query.includes("standalone"),
    media: query,
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("InstallSection", () => {
  it("reports not installed with no install path on desktop Firefox-like browsers", () => {
    stubEnv();
    render(<InstallSection />);
    expect(screen.getByText(/Not installed yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "INSTALL APP" })).toBeNull();
    expect(screen.queryByText(/Add to Home Screen/)).toBeNull();
  });

  it("offers the one-tap button once the browser offers installation", () => {
    stubEnv();
    render(<InstallSection />);
    const event = new Event("beforeinstallprompt");
    Object.assign(event, {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(screen.getByText(/Not installed yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "INSTALL APP" })).toBeInTheDocument();
  });

  it("shows the iOS Add to Home Screen steps on iPhone Safari", () => {
    stubEnv({ userAgent: IPHONE_SAFARI });
    render(<InstallSection />);
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });

  it("reports installed when running standalone from the Home Screen", () => {
    stubEnv({ standalone: true });
    render(<InstallSection />);
    expect(screen.getByText(/opens full screen from your Home Screen/)).toBeInTheDocument();
    expect(screen.queryByText(/Not installed yet/)).toBeNull();
  });

  it("reports installed in iOS Safari Home Screen mode", () => {
    stubEnv({ userAgent: IPHONE_SAFARI, appleStandalone: true });
    render(<InstallSection />);
    expect(screen.getByText(/opens full screen from your Home Screen/)).toBeInTheDocument();
    expect(screen.queryByText(/Add to Home Screen/)).toBeNull();
  });

  it("flips to installed and drops the install options after appinstalled", () => {
    stubEnv({ userAgent: IPHONE_SAFARI });
    render(<InstallSection />);
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.getByText(/opens full screen from your Home Screen/)).toBeInTheDocument();
    expect(screen.queryByText(/Not installed yet/)).toBeNull();
    expect(screen.queryByText(/Add to Home Screen/)).toBeNull();
    expect(screen.queryByRole("button", { name: "INSTALL APP" })).toBeNull();
  });
});
