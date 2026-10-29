import { describe, expect, it } from "vitest";
import { MONDAY, WEDNESDAY } from "./templates";
import {
  buildEffectiveExercises,
  buildEffectiveTemplate,
} from "./effectiveTemplate";
import type { ExtraExercise, Profile } from "../data/settings";

const sampleExtra: ExtraExercise = {
  key: "custom-biceps-curl",
  name: "Biceps Curl",
  targetSets: 2,
  targetRepsMin: 10,
  targetRepsMax: 10,
  tip: "Keep elbows fixed.",
};

const sampleExtra2: ExtraExercise = {
  key: "custom-triceps-pushdown",
  name: "Triceps Pushdown",
  targetSets: 2,
  targetRepsMin: 10,
  targetRepsMax: 12,
  tip: "Squeeze at bottom.",
};

describe("buildEffectiveExercises", () => {
  it("empty list returns template unchanged (identity equality)", () => {
    expect(buildEffectiveExercises(MONDAY)).toBe(MONDAY.exercises);
    expect(buildEffectiveExercises(MONDAY, null)).toBe(MONDAY.exercises);
    expect(buildEffectiveExercises(MONDAY, { extraExercises: [] } as unknown as Profile)).toBe(
      MONDAY.exercises,
    );
  });

  it("extras appended and ordered before trailing stretch with continuing order", () => {
    // MONDAY has 7 exercises: 1..6 (warmup, leg press, chest press, row, leg curl, bike), 7 (stretch)
    const effective = buildEffectiveExercises(MONDAY, {
      extraExercises: [sampleExtra, sampleExtra2],
    } as unknown as Profile);

    expect(effective).toHaveLength(MONDAY.exercises.length + 2);

    // Order numbers are strictly sequential 1..9
    expect(effective.map((e) => e.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    // Extras are placed before Stretch
    const stretch = effective[effective.length - 1]!;
    expect(stretch.key).toBe("stretch");
    expect(stretch.order).toBe(9);

    const extra1 = effective[6]!;
    expect(extra1.key).toBe("custom-biceps-curl");
    expect(extra1.name).toBe("Biceps Curl");
    expect(extra1.kind).toBe("resistance");
    expect(extra1.targetSets).toBe(2);
    expect(extra1.targetRepsMin).toBe(10);
    expect(extra1.targetRepsMax).toBe(10);
    expect(extra1.durationMinutes).toBeNull();
    expect(extra1.tip).toBe("Keep elbows fixed.");
    expect(extra1.order).toBe(7);

    const extra2 = effective[7]!;
    expect(extra2.key).toBe("custom-triceps-pushdown");
    expect(extra2.order).toBe(8);
  });

  it("appends at the end when there is no trailing stretch", () => {
    // WEDNESDAY ends with Supported Balance (kind: balance), not stretch
    const effective = buildEffectiveExercises(WEDNESDAY, {
      extraExercises: [sampleExtra],
    } as unknown as Profile);

    expect(effective).toHaveLength(WEDNESDAY.exercises.length + 1);
    expect(effective.map((e) => e.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const last = effective[effective.length - 1]!;
    expect(last.key).toBe("custom-biceps-curl");
    expect(last.order).toBe(9);
  });

  it("ensures keys are unique even when extra exercises collide with template or each other", () => {
    const collidingExtra: ExtraExercise = {
      key: "leg-press", // collides with template's leg-press
      name: "Leg Press Custom",
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 8,
      tip: "",
    };
    const duplicateExtra: ExtraExercise = {
      key: "leg-press",
      name: "Leg Press Another",
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 8,
      tip: "",
    };

    const effective = buildEffectiveExercises(MONDAY, {
      extraExercises: [collidingExtra, duplicateExtra],
    } as unknown as Profile);

    const keys = effective.map((e) => e.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
    expect(keys).toContain("leg-press");
    expect(keys).toContain("leg-press-2");
    expect(keys).toContain("leg-press-3");
  });
});

describe("buildEffectiveTemplate", () => {
  it("returns original template when extra exercises is empty", () => {
    expect(buildEffectiveTemplate(MONDAY)).toBe(MONDAY);
    expect(buildEffectiveTemplate(MONDAY, null)).toBe(MONDAY);
    expect(buildEffectiveTemplate(MONDAY, { extraExercises: [] } as unknown as Profile)).toBe(
      MONDAY,
    );
  });

  it("returns new template with effective exercises when extras exist", () => {
    const effective = buildEffectiveTemplate(MONDAY, {
      extraExercises: [sampleExtra],
    } as unknown as Profile);

    expect(effective).not.toBe(MONDAY);
    expect(effective.id).toBe(MONDAY.id);
    expect(effective.weekday).toBe(MONDAY.weekday);
    expect(effective.workoutType).toBe(MONDAY.workoutType);
    expect(effective.exercises).toHaveLength(MONDAY.exercises.length + 1);
  });
});
