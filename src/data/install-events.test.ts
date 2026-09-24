import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(async () => undefined),
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...p: string[]) => p.join("/"),
  setDoc: mocks.setDoc,
}));

import { recordInstallEvent } from "./install-events";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordInstallEvent", () => {
  it("validates and appends the event document", async () => {
    await recordInstallEvent({ db: {} as never }, "u1", {
      type: "prompt_result",
      outcome: "dismissed",
    });
    expect(mocks.setDoc).toHaveBeenCalledOnce();
    const [path, data] = mocks.setDoc.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(path).toMatch(/^users\/u1\/installEvents\/e/);
    expect(data.type).toBe("prompt_result");
    expect(data.outcome).toBe("dismissed");
    expect(data.method).toBeNull();
    expect(data.userAgent).toEqual(expect.any(String));
    expect(data.createdAt).toBeInstanceOf(Date);
  });

  it("records nudge funnel events with null outcome and method", async () => {
    await recordInstallEvent({ db: {} as never }, "u1", { type: "nudge_shown" });
    await recordInstallEvent({ db: {} as never }, "u1", { type: "nudge_dismissed" });
    expect(mocks.setDoc).toHaveBeenCalledTimes(2);
    for (const call of mocks.setDoc.mock.calls) {
      const [, data] = call as unknown as [string, Record<string, unknown>];
      expect(data.outcome).toBeNull();
      expect(data.method).toBeNull();
    }
  });

  it("refuses to write an invalid event", async () => {
    await expect(
      recordInstallEvent({ db: {} as never }, "u1", {
        type: "bogus" as never,
      }),
    ).rejects.toThrow();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});
