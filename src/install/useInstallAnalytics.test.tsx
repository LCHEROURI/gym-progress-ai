// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordInstallEvent: vi.fn(async () => undefined),
}));

vi.mock("../data/install-events", () => ({
  recordInstallEvent: mocks.recordInstallEvent,
}));

import { useInstallAnalytics } from "./useInstallAnalytics";
import { trackInstallEvent } from "./install-analytics";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const db = {} as never;

function useAnalyticsUnderTest() {
  useInstallAnalytics(db, "u1");
}

const mount = () => renderHook(useAnalyticsUnderTest);

describe("useInstallAnalytics", () => {
  it("records the prompt funnel through the bound recorder", () => {
    const { unmount } = mount();
    window.dispatchEvent(new Event("beforeinstallprompt"));
    expect(mocks.recordInstallEvent).toHaveBeenCalledWith(
      { db },
      "u1",
      { type: "prompt_offered" },
    );
    trackInstallEvent({ type: "prompt_result", outcome: "accepted" });
    expect(mocks.recordInstallEvent).toHaveBeenCalledWith(
      { db },
      "u1",
      { type: "prompt_result", outcome: "accepted" },
    );
    unmount();
  });

  it("records the install once from the browser prompt", () => {
    const { unmount } = mount();
    window.dispatchEvent(new Event("appinstalled"));
    window.dispatchEvent(new Event("appinstalled"));
    expect(mocks.recordInstallEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordInstallEvent).toHaveBeenCalledWith(
      { db },
      "u1",
      { type: "installed", method: "browser_prompt" },
    );
    unmount();
  });

  it("records a manual Home Screen install once across launches", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const first = mount();
    expect(mocks.recordInstallEvent).toHaveBeenCalledWith(
      { db },
      "u1",
      { type: "installed", method: "home_screen" },
    );
    first.unmount();
    mount();
    expect(mocks.recordInstallEvent).toHaveBeenCalledTimes(1);
  });
});
