export type ExerciseKind = "resistance" | "cardio" | "stretch" | "balance";

export interface TemplateExercise {
  key: string;
  name: string;
  order: number;
  kind: ExerciseKind;
  targetSets: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  durationMinutes: number | null;
  tip: string;
  altOf?: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  weekday: 1 | 3 | 5;
  workoutType: "strength_bike" | "balance_strength" | "full_body_walk";
  exercises: TemplateExercise[];
}

const ex = (
  order: number,
  key: string,
  name: string,
  kind: ExerciseKind,
  target: { sets: number; repsMin: number; repsMax: number } | { minutes: number },
  tip: string,
  altOf?: string,
): TemplateExercise => ({
  key,
  name,
  order,
  kind,
  targetSets: "sets" in target ? target.sets : null,
  targetRepsMin: "sets" in target ? target.repsMin : null,
  targetRepsMax: "sets" in target ? target.repsMax : null,
  durationMinutes: "minutes" in target ? target.minutes : null,
  tip,
  ...(altOf ? { altOf } : {}),
});

export const MONDAY: WorkoutTemplate = {
  id: "mon-strength-bike",
  name: "Strength + Bike",
  weekday: 1,
  workoutType: "strength_bike",
  exercises: [
    ex(1, "bike-warmup", "Bike Warm-up", "cardio", { minutes: 6 }, "Easy pace, 5–8 minutes."),
    ex(2, "leg-press", "Leg Press", "resistance", { sets: 2, repsMin: 10, repsMax: 10 }, "Keep your feet flat and avoid locking your knees."),
    ex(3, "chest-press", "Chest Press", "resistance", { sets: 2, repsMin: 10, repsMax: 10 }, "Keep your shoulders down and control the handles during the return."),
    ex(4, "seated-row", "Seated Row", "resistance", { sets: 2, repsMin: 10, repsMax: 10 }, "Keep your chest tall and pull your elbows backward."),
    ex(5, "leg-curl", "Leg Curl", "resistance", { sets: 2, repsMin: 8, repsMax: 10 }, "Move slowly on the way down."),
    ex(6, "bike", "Bike", "cardio", { minutes: 12 }, "Steady pace, 10–15 minutes."),
    ex(7, "stretch", "Stretch", "stretch", { minutes: 5 }, "Gentle stretches, no bouncing."),
  ],
};

export const WEDNESDAY: WorkoutTemplate = {
  id: "wed-balance-strength",
  name: "Balance + Strength",
  weekday: 3,
  workoutType: "balance_strength",
  exercises: [
    ex(1, "bike-warmup", "Bike Warm-up", "cardio", { minutes: 6 }, "Easy pace, 5–8 minutes."),
    ex(2, "leg-press", "Leg Press", "resistance", { sets: 2, repsMin: 10, repsMax: 10 }, "Keep your feet flat and avoid locking your knees."),
    ex(3, "lat-pulldown", "Lat Pulldown", "resistance", { sets: 2, repsMin: 10, repsMax: 10 }, "Pull toward your upper chest without leaning far backward."),
    ex(4, "leg-extension", "Leg Extension OR Step-ups", "resistance", { sets: 2, repsMin: 8, repsMax: 10 }, "Smooth motion, no swinging.", "leg-extension"),
    ex(5, "shoulder-press", "Seated Shoulder Press", "resistance", { sets: 2, repsMin: 8, repsMax: 8 }, "Keep your back supported and avoid arching."),
    ex(6, "pallof-press", "Cable Core / Pallof Press", "resistance", { sets: 2, repsMin: 10, repsMax: 10 }, "Keep your torso facing forward and resist rotation."),
    ex(7, "treadmill-walk", "Treadmill Walk", "cardio", { minutes: 15 }, "Comfortable pace, 15 minutes."),
    ex(8, "supported-balance", "Supported Balance", "balance", { minutes: 2 }, "2 rounds, 10–20 seconds each leg."),
  ],
};

export const FRIDAY: WorkoutTemplate = {
  id: "fri-full-body-walk",
  name: "Full Body + Walk",
  weekday: 5,
  workoutType: "full_body_walk",
  exercises: [
    ex(1, "warmup", "Bike or Treadmill Warm-up", "cardio", { minutes: 6 }, "Easy pace, 5–8 minutes."),
    ex(2, "leg-press", "Leg Press", "resistance", { sets: 2, repsMin: 10, repsMax: 10 }, "Keep your feet flat and avoid locking your knees."),
    ex(3, "chest-press", "Chest Press", "resistance", { sets: 2, repsMin: 10, repsMax: 10 }, "Keep your shoulders down and control the handles during the return."),
    ex(4, "seated-row", "Seated Row", "resistance", { sets: 2, repsMin: 10, repsMax: 10 }, "Keep your chest tall and pull your elbows backward."),
    ex(5, "leg-curl", "Leg Curl", "resistance", { sets: 2, repsMin: 8, repsMax: 10 }, "Move slowly on the way down."),
    ex(6, "ab-machine", "Cable Core or Ab Machine", "resistance", { sets: 2, repsMin: 10, repsMax: 10 }, "Exhale as you crunch; keep it controlled.", "ab-machine"),
    ex(7, "walk-bike", "Treadmill or Bike", "cardio", { minutes: 12 }, "Steady pace, 10–15 minutes."),
    ex(8, "stretch", "Stretch", "stretch", { minutes: 5 }, "Gentle stretches, no bouncing."),
  ],
};

export const TEMPLATES: WorkoutTemplate[] = [MONDAY, WEDNESDAY, FRIDAY];

export function templateForWeekday(weekday: number): WorkoutTemplate | null {
  return TEMPLATES.find((t) => t.weekday === weekday) ?? null;
}
