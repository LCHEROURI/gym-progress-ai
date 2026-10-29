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
  createCustomExerciseKey,
  defaultProfile,
  fetchProfile,
  profileSchema,
  saveProfile,
  slugifyExercise,
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

  it("validates extraExercises bounded to 20 items with resistance shape", () => {
    const p = defaultProfile();
    const valid = {
      ...p,
      extraExercises: [
        {
          key: "custom-biceps-curl",
          name: "Biceps Curl",
          targetSets: 2,
          targetRepsMin: 10,
          targetRepsMax: 10,
          tip: "Keep elbows pinned.",
        },
      ],
    };
    expect(() => profileSchema.parse(valid)).not.toThrow();

    // Rejects more than 20
    const over20 = {
      ...p,
      extraExercises: Array.from({ length: 21 }, (_, i) => ({
        key: `custom-ex-${i}`,
        name: `Exercise ${i}`,
        targetSets: 2,
        targetRepsMin: 10,
        targetRepsMax: 10,
        tip: "",
      })),
    };
    expect(() => profileSchema.parse(over20)).toThrow();

    // Rejects invalid targetSets
    expect(() =>
      profileSchema.parse({
        ...p,
        extraExercises: [
          {
            key: "custom-curl",
            name: "Curl",
            targetSets: 0,
            targetRepsMin: 10,
            targetRepsMax: 10,
            tip: "",
          },
        ],
      }),
    ).toThrow();
  });
});

describe("custom exercise key helpers", () => {
  it("slugifies exercise names cleanly", () => {
    expect(slugifyExercise("Biceps Curl")).toBe("biceps-curl");
    expect(slugifyExercise("  Triceps Pushdown!! ")).toBe("triceps-pushdown");
    expect(slugifyExercise("")).toBe("exercise");
  });

  it("dedupes custom exercise keys against existing keys", () => {
    expect(createCustomExerciseKey("Biceps Curl", [])).toBe("custom-biceps-curl");
    expect(createCustomExerciseKey("Biceps Curl", ["custom-biceps-curl"])).toBe(
      "custom-biceps-curl-2",
    );
    expect(
      createCustomExerciseKey("Biceps Curl", [
        "custom-biceps-curl",
        "custom-biceps-curl-2",
      ]),
    ).toBe("custom-biceps-curl-3");
  });
});

describe("fetch/save", () => {
  const timestamp = (d: Date) => ({ toDate: () => d, seconds: d.getTime() / 1000 });

  it("converts createdAt and updatedAt Timestamps instead of throwing", async () => {
    const raw = defaultProfile();
    mocks.getDoc.mockResolvedValueOnce({
      data: () => ({
        ...raw,
        createdAt: timestamp(raw.createdAt),
        updatedAt: timestamp(raw.updatedAt),
      }),
    } as never);
    const p = await fetchProfile({ db: {} as never }, "u1");
    expect(p.createdAt).toBeInstanceOf(Date);
    expect(p.updatedAt).toBeInstanceOf(Date);
  });

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
