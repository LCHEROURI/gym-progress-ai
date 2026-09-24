import { describe, expect, it } from "vitest";
import { buildCelebration, perfectWeekStreak } from "./streak";

// Monday-anchored weeks: 2026-09-21 is a Monday; the template is Mon/Wed/Fri.
const WEEK1 = ["2026-09-07", "2026-09-09", "2026-09-11"];
const WEEK2 = ["2026-09-14", "2026-09-16", "2026-09-18"];
const WEEK3 = ["2026-09-21", "2026-09-23", "2026-09-25"];
const friday = new Date("2026-09-25T12:00:00Z");
const wednesday = new Date("2026-09-23T12:00:00Z");
const tuesday = new Date("2026-09-22T12:00:00Z");

describe("perfectWeekStreak", () => {
  it("counts consecutive perfect weeks including the current one", () => {
    expect(perfectWeekStreak([...WEEK1, ...WEEK2, ...WEEK3], friday)).toBe(3);
  });

  it("keeps last week's streak alive while this week is incomplete", () => {
    expect(
      perfectWeekStreak([...WEEK1, ...WEEK2, WEEK3[0]], tuesday),
    ).toBe(2);
  });

  it("breaks the streak at a missed week", () => {
    expect(perfectWeekStreak([...WEEK1, ...WEEK3], friday)).toBe(1);
  });

  it("is zero with no completed weeks", () => {
    expect(perfectWeekStreak([], friday)).toBe(0);
  });
});

describe("buildCelebration", () => {
  it("celebrates a perfect week and names the streak", () => {
    const c = buildCelebration({
      completedDates: [...WEEK1, ...WEEK2, ...WEEK3],
      today: friday,
    });
    expect(c.title).toBe("PERFECT WEEK!");
    expect(c.body).toBe("3 weeks in a row with all 3 workouts. 🔥");
    expect(c.perfectWeek).toBe(true);
    expect(c.streakWeeks).toBe(3);
  });

  it("encourages a streak after a first perfect week", () => {
    const c = buildCelebration({ completedDates: WEEK3, today: friday });
    expect(c.title).toBe("PERFECT WEEK!");
    expect(c.body).toBe("All 3 workouts done this week. Start a streak!");
    expect(c.streakWeeks).toBe(1);
  });

  it("warns when a live streak is on the line", () => {
    const c = buildCelebration({
      completedDates: [...WEEK1, ...WEEK2, WEEK3[0], WEEK3[1]],
      today: wednesday,
    });
    expect(c.title).toBe("WORKOUT SAVED!");
    expect(c.body).toBe(
      "2 of 3 workouts this week — 1 more to keep your 2-week streak alive.",
    );
    expect(c.streakWeeks).toBe(2);
  });

  it("reports plain weekly progress without a streak", () => {
    const c = buildCelebration({ completedDates: [WEEK3[0]], today: tuesday });
    expect(c.title).toBe("WORKOUT SAVED!");
    expect(c.body).toBe("1 of 3 workouts this week.");
  });
});
