import { describe, expect, it } from "vitest";
import { FRIDAY, MONDAY, TEMPLATES, WEDNESDAY, templateForWeekday } from "./templates";

describe("workout templates (printed sheet, verbatim)", () => {
  it("has exactly Mon/Wed/Fri templates", () => {
    expect(TEMPLATES.map((t) => t.weekday)).toEqual([1, 3, 5]);
  });

  it("Monday is Strength + Bike with 7 exercises in sheet order", () => {
    expect(MONDAY.name).toBe("Strength + Bike");
    expect(MONDAY.exercises.map((e) => e.name)).toEqual([
      "Bike Warm-up", "Leg Press", "Chest Press", "Seated Row",
      "Leg Curl", "Bike", "Stretch",
    ]);
  });

  it("Wednesday is Balance + Strength with 8 exercises incl. the OR variant", () => {
    expect(WEDNESDAY.name).toBe("Balance + Strength");
    expect(WEDNESDAY.exercises).toHaveLength(8);
    expect(WEDNESDAY.exercises[3].name).toBe("Leg Extension OR Step-ups");
    expect(WEDNESDAY.exercises[7].name).toBe("Supported Balance");
    expect(WEDNESDAY.exercises[7].kind).toBe("balance");
  });

  it("Friday is Full Body + Walk with 8 exercises incl. the OR variant", () => {
    expect(FRIDAY.name).toBe("Full Body + Walk");
    expect(FRIDAY.exercises).toHaveLength(8);
    expect(FRIDAY.exercises[5].name).toBe("Cable Core or Ab Machine");
  });

  it("resistance exercises carry 2 sets and cardio carries minutes", () => {
    const legPress = MONDAY.exercises[1];
    expect([legPress.targetSets, legPress.targetRepsMin, legPress.targetRepsMax]).toEqual([2, 10, 10]);
    expect(MONDAY.exercises[0].durationMinutes).not.toBeNull();
    expect(MONDAY.exercises[0].targetSets).toBeNull();
  });

  it("every exercise has a short tip and sequential order", () => {
    for (const t of TEMPLATES) {
      t.exercises.forEach((e, i) => {
        expect(e.order).toBe(i + 1);
        expect(e.tip.length).toBeGreaterThan(0);
        expect(e.tip.length).toBeLessThanOrEqual(120);
      });
    }
  });

  it("templateForWeekday maps days and returns null on rest days", () => {
    expect(templateForWeekday(1)?.id).toBe("mon-strength-bike");
    expect(templateForWeekday(3)?.id).toBe("wed-balance-strength");
    expect(templateForWeekday(5)?.id).toBe("fri-full-body-walk");
    expect(templateForWeekday(2)).toBeNull();
    expect(templateForWeekday(0)).toBeNull();
  });
});
