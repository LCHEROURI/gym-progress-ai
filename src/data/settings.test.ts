import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(async () => ({ data: () => undefined })),
  setDoc: vi.fn(async () => {}),
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...p: string[]) => p.join("/"),
  getDoc: mocks.getDoc,
  setDoc: mocks.setDoc,
}));

import {
  defaultProfile,
  fetchProfile,
  profileSchema,
  saveProfile,
} from "./settings";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("profileSchema", () => {
  it("accepts the default profile", () => {
    expect(() => profileSchema.parse(defaultProfile())).not.toThrow();
  });

  it("rejects unknown fields and bad reminder times (strict)", () => {
    const p = defaultProfile();
    expect(() => profileSchema.parse({ ...p, extra: 1 })).toThrow();
    expect(() =>
      profileSchema.parse({ ...p, reminderTimes: { mon: "9am" } }),
    ).toThrow();
    expect(() => profileSchema.parse({ ...p, defaultRestSeconds: 30 })).toThrow();
  });
});

describe("fetch/save", () => {
  it("returns defaults when no profile exists yet", async () => {
    const p = await fetchProfile({ db: {} as never }, "u1");
    expect(p.weightUnit).toBe("lb");
    expect(p.largeTextEnabled).toBe(true);
    expect(p.defaultRestSeconds).toBe(75);
  });

  it("persists validated profiles and rejects invalid ones", async () => {
    await saveProfile({ db: {} as never }, "u1", defaultProfile());
    const [ref] = mocks.setDoc.mock.calls[0] as unknown as [string];
    expect(ref).toBe("users/u1/settings/profile");
    await expect(
      saveProfile({ db: {} as never }, "u1", { ...defaultProfile(), weightUnit: "st" as never }),
    ).rejects.toThrow();
    expect(mocks.setDoc).toHaveBeenCalledOnce();
  });
});
