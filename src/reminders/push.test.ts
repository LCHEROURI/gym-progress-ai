// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(async () => "fcm-token-abc"),
  saveFcmToken: vi.fn(async () => undefined),
  getMessaging: vi.fn(() => ({ mocked: true })),
}));

vi.mock("firebase/messaging", () => ({
  getMessaging: mocks.getMessaging,
  getToken: mocks.getToken,
}));
vi.mock("../data/fcm-tokens", () => ({ saveFcmToken: mocks.saveFcmToken }));

import { enablePushReminders, pushSupported } from "./push";

const app = {} as never;
const db = {} as never;

function stubBrowser(permission: "granted" | "denied" | "default") {
  vi.stubGlobal("Notification", {
    permission,
    requestPermission: vi.fn(async () => permission),
  });
  vi.stubGlobal("navigator", {
    ...navigator,
    serviceWorker: { ready: Promise.resolve({ mocked: true }) },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_FCM_VAPID_KEY", "test-vapid-key");
});
afterEach(() => vi.unstubAllGlobals());

describe("enablePushReminders", () => {
  it("saves the token with the device time zone when allowed", async () => {
    stubBrowser("granted");
    expect(await enablePushReminders({ app, db, uid: "u1" })).toBe("on");
    expect(mocks.getToken).toHaveBeenCalledOnce();
    expect(mocks.saveFcmToken).toHaveBeenCalledWith(
      { db },
      "u1",
      expect.objectContaining({
        token: "fcm-token-abc",
        timeZone: expect.any(String),
      }),
    );
  });

  it("reports denial without writing anything", async () => {
    stubBrowser("denied");
    expect(await enablePushReminders({ app, db, uid: "u1" })).toBe("denied");
    expect(mocks.saveFcmToken).not.toHaveBeenCalled();
  });

  it("fails honestly when the push key is not configured", async () => {
    stubBrowser("granted");
    vi.stubEnv("VITE_FCM_VAPID_KEY", "");
    await expect(enablePushReminders({ app, db, uid: "u1" })).rejects.toThrow(
      /VITE_FCM_VAPID_KEY/,
    );
    expect(mocks.saveFcmToken).not.toHaveBeenCalled();
  });

  it("detects unsupported browsers", async () => {
    vi.stubGlobal("Notification", undefined);
    expect(pushSupported()).toBe(false);
    expect(await enablePushReminders({ app, db, uid: "u1" })).toBe(
      "unsupported",
    );
  });
});
