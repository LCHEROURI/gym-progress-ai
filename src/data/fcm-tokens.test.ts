import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(async () => undefined),
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...p: string[]) => p.join("/"),
  setDoc: mocks.setDoc,
}));

import { fcmTokenSchema, saveFcmToken, tokenIdFor } from "./fcm-tokens";

const valid = {
  id: "ta",
  token: "fcm-token-abc",
  timeZone: "America/New_York",
  platform: "web" as const,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

beforeEach(() => vi.clearAllMocks());

describe("fcmTokenSchema", () => {
  it("accepts a well-formed registration and rejects junk", () => {
    expect(fcmTokenSchema.parse(valid)).toEqual(valid);
    expect(() => fcmTokenSchema.parse({ ...valid, platform: "ios" })).toThrow();
    expect(() => fcmTokenSchema.parse({ ...valid, token: "" })).toThrow();
    expect(() => fcmTokenSchema.parse({ ...valid, extra: 1 })).toThrow();
  });
});

describe("tokenIdFor", () => {
  it("is stable per token and distinct across tokens", () => {
    expect(tokenIdFor("abc")).toBe(tokenIdFor("abc"));
    expect(tokenIdFor("abc")).not.toBe(tokenIdFor("abd"));
  });
});

describe("saveFcmToken", () => {
  it("writes a validated document at the deterministic id", async () => {
    await saveFcmToken({ db: {} as never }, "u1", {
      token: "fcm-token-abc",
      timeZone: "America/New_York",
    });
    expect(mocks.setDoc).toHaveBeenCalledOnce();
    const [path, data] = mocks.setDoc.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(path).toBe(`users/u1/fcmTokens/${tokenIdFor("fcm-token-abc")}`);
    expect(data.platform).toBe("web");
    expect(data.timeZone).toBe("America/New_York");
    expect(data.createdAt).toBeInstanceOf(Date);
  });

  it("refuses to write an invalid registration", async () => {
    await expect(
      saveFcmToken({ db: {} as never }, "u1", {
        token: "",
        timeZone: "America/New_York",
      }),
    ).rejects.toThrow();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});
