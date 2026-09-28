// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appCheckStatus, initAppCheck } from "./app-check";
import type { FirebaseApp } from "firebase/app";

const initializeAppCheck = vi.fn();
const v3Provider = vi.fn();

vi.mock("firebase/app-check", () => ({
  initializeAppCheck: (...args: unknown[]) => initializeAppCheck(...args),
  ReCaptchaV3Provider: class {
    constructor(public siteKey: string) {
      v3Provider(siteKey);
    }
  },
}));

const app = { name: "test-app" } as unknown as FirebaseApp;
const noKey = { appCheckSiteKey: undefined, useEmulator: false };
const withKey = { appCheckSiteKey: "site-key", useEmulator: false };

beforeEach(() => {
  initializeAppCheck.mockClear();
  v3Provider.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("initAppCheck", () => {
  it("does nothing without a site key, so an unregistered app still boots", async () => {
    expect(await initAppCheck(app, noKey)).toBe("disabled");
    expect(initializeAppCheck).not.toHaveBeenCalled();
  });

  it("registers the reCAPTCHA v3 provider when a site key is present", async () => {
    expect(await initAppCheck(app, withKey)).toBe("active");
    expect(v3Provider).toHaveBeenCalledWith("site-key");
    expect(initializeAppCheck).toHaveBeenCalledWith(
      app,
      expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
    );
  });

  it("skips the emulator, which does not implement App Check", async () => {
    // A reCAPTCHA prompt during emulator testing is a hang, not a signal.
    expect(await initAppCheck(app, { ...withKey, useEmulator: true })).toBe("emulator");
    expect(initializeAppCheck).not.toHaveBeenCalled();
  });

  it("resolves 'failed' instead of throwing when the SDK blows up", async () => {
    // The whole point: a blocked reCAPTCHA, an ad blocker, or a bad site key
    // must not take down a user mid-workout. A rejecting dynamic import lands
    // in this same catch, so one case covers both halves of the hazard.
    initializeAppCheck.mockImplementationOnce(() => {
      throw new Error("ERR_BLOCKED_BY_CLIENT");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(initAppCheck(app, withKey)).resolves.toBe("failed");
  });

  it("never throws, whatever the SDK does", async () => {
    // initAuth awaits this, so a rejection here would take down sign-in for
    // every user. The return type is the whole contract.
    initializeAppCheck.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(initAppCheck(app, withKey)).resolves.toBeTypeOf("string");
  });

  it("reports the last outcome for the settings screen", async () => {
    await initAppCheck(app, withKey);
    expect(appCheckStatus()).toBe("active");
    await initAppCheck(app, noKey);
    expect(appCheckStatus()).toBe("disabled");
  });
});
