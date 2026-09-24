import { describe, expect, it } from "vitest";
import {
  alreadySent,
  buildReminderMessage,
  localParts,
  reminderStateSchema,
  slotsDue,
} from "../functions/src/reminders";

const times = { mon: "07:30", wed: "07:30", fri: "07:30" };

describe("localParts", () => {
  it("reads the device wall clock through the time zone", () => {
    // 11:32Z is 07:32 Friday in New York (EDT, UTC-4).
    const p = localParts(new Date("2026-09-25T11:32:00Z"), "America/New_York");
    expect(p).toEqual({ dayKey: "fri", minutes: 7 * 60 + 32, date: "2026-09-25" });
  });

  it("follows DST instead of a fixed offset", () => {
    // Same local wall clock (07:30 Mon) on both sides of the US DST change —
    // the UTC hour differs (11:30Z in October, 12:30Z in November).
    const oct = localParts(new Date("2026-10-26T11:30:30Z"), "America/New_York");
    const nov = localParts(new Date("2026-11-02T12:30:30Z"), "America/New_York");
    expect(oct.minutes).toBe(7 * 60 + 30);
    expect(nov.minutes).toBe(7 * 60 + 30);
    expect(oct.dayKey).toBe("mon");
    expect(nov.dayKey).toBe("mon");
  });

  it("returns null dayKey for configured days only via callers", () => {
    // Tuesday/Thursday/Saturday/Sunday are never due regardless of time.
    expect(localParts(new Date("2026-09-26T11:31:00Z"), "America/New_York").dayKey).toBeNull();
  });
});

describe("slotsDue", () => {
  it("fires the day's slot inside the catch-up window only", () => {
    const now = new Date("2026-09-25T11:32:00Z"); // Fri 07:32 in NY
    expect(slotsDue({ reminderTimes: times, timeZone: "America/New_York", now })).toEqual([
      { dayKey: "fri", time: "07:30", slot: "2026-09-25T07:30" },
    ]);
  });

  it("ignores early, late, and unconfigured slots", () => {
    const tz = "America/New_York";
    expect(slotsDue({ reminderTimes: times, timeZone: tz, now: new Date("2026-09-25T11:25:00Z") })).toEqual([]); // 07:25 — early
    expect(slotsDue({ reminderTimes: times, timeZone: tz, now: new Date("2026-09-25T11:50:00Z") })).toEqual([]); // 07:50 — outside 15 min
    expect(
      slotsDue({ reminderTimes: { mon: "07:30" }, timeZone: tz, now: new Date("2026-09-25T11:32:00Z") }),
    ).toEqual([]); // Friday not configured
  });

  it("respects the device time zone, not the server's", () => {
    const now = new Date("2026-09-25T11:32:00Z"); // already 20:32 in Tokyo (same date)
    expect(
      slotsDue({ reminderTimes: { fri: "20:30" }, timeZone: "Asia/Tokyo", now }),
    ).toEqual([{ dayKey: "fri", time: "20:30", slot: "2026-09-25T20:30" }]);
    expect(
      slotsDue({ reminderTimes: times, timeZone: "Asia/Tokyo", now }),
    ).toEqual([]); // 07:30 has not arrived in Tokyo
  });
});

describe("alreadySent + message", () => {
  it("prevents double-sends per slot but allows the next one", () => {
    expect(alreadySent("2026-09-25T07:30", "2026-09-25T07:30")).toBe(true);
    expect(alreadySent(undefined, "2026-09-25T07:30")).toBe(false);
    expect(alreadySent("2026-09-23T07:30", "2026-09-25T07:30")).toBe(false);
  });

  it("names the day in the reminder copy", () => {
    expect(buildReminderMessage("mon").body).toContain("Monday");
    expect(buildReminderMessage("wed").body).toContain("Wednesday");
    expect(buildReminderMessage("fri").body).toContain("Friday");
    expect(buildReminderMessage("fri").title).toBe("Gym Progress AI");
  });

  it("validates the send-guard document shape strictly", () => {
    const doc = { tokenId: "ta", slot: "2026-09-25T07:30", sentAt: new Date(0) };
    expect(reminderStateSchema.parse(doc)).toEqual(doc);
    expect(() => reminderStateSchema.parse({ ...doc, slot: "yesterday" })).toThrow();
    expect(() => reminderStateSchema.parse({ ...doc, extra: 1 })).toThrow();
  });
});
