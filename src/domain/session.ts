import { z } from "zod";
import type { WorkoutTemplate } from "./templates";

export const weightUnitSchema = z.enum(["lb", "kg"]);
export const difficultySchema = z.enum(["easy", "good", "hard"]);
export const painStatusSchema = z.enum(["none", "mild", "stopped"]);
export const sessionStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "completed",
  "abandoned",
]);

export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const workoutSessionSchema = z
  .object({
    id: z.string().min(1).max(40),
    userId: z.string().min(1),
    templateId: z.string().min(1).max(60),
    workoutType: z.enum(["strength_bike", "balance_strength", "full_body_walk"]),
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startedAt: z.date().nullable(),
    completedAt: z.date().nullable(),
    status: sessionStatusSchema,
    overallEffort: difficultySchema.nullable(),
    painReported: z.boolean(),
    dizzinessReported: z.boolean(),
    shortnessOfBreathReported: z.boolean(),
    notes: z.string().max(1000),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

export type WorkoutSession = z.infer<typeof workoutSessionSchema>;

export const exerciseSessionSchema = z
  .object({
    exerciseKey: z.string().min(1).max(60),
    exerciseName: z.string().min(1).max(120),
    exerciseOrder: z.number().int().min(1).max(40),
    targetSets: z.number().int().min(1).max(20).nullable(),
    targetRepsMin: z.number().int().min(1).max(200).nullable(),
    targetRepsMax: z.number().int().min(1).max(200).nullable(),
    weightUsed: z.number().min(0).max(2000).nullable(),
    weightUnit: weightUnitSchema.nullable(),
    difficulty: difficultySchema.nullable(),
    painStatus: painStatusSchema.nullable(),
    completed: z.boolean(),
    durationMinutes: z.number().min(0).max(600).nullable(),
    previousWeight: z.number().min(0).max(2000).nullable(),
    aiSuggestedWeight: z.number().min(0).max(2000).nullable(),
    aiRecommendationId: z.string().max(40).nullable(),
    notes: z.string().max(1000),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

export type ExerciseSession = z.infer<typeof exerciseSessionSchema>;

export const setSchema = z
  .object({
    setNumber: z.number().int().min(1).max(20),
    weight: z.number().min(0).max(2000),
    reps: z.number().int().min(0).max(200),
    completed: z.boolean(),
    createdAt: z.date(),
  })
  .strict();

export type WorkoutSet = z.infer<typeof setSchema>;

/** Mirrors validSessionTransition() in firestore.rules. */
export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return (
    (from === "not_started" && to === "in_progress") ||
    (from === "in_progress" && (to === "completed" || to === "abandoned")) ||
    ((from === "completed" || from === "abandoned") && to === "in_progress")
  );
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildSession(input: {
  sessionId: string;
  uid: string;
  template: WorkoutTemplate;
  scheduledDate: string;
  now?: Date;
}): WorkoutSession {
  const now = input.now ?? new Date();
  return workoutSessionSchema.parse({
    id: input.sessionId,
    userId: input.uid,
    templateId: input.template.id,
    workoutType: input.template.workoutType,
    scheduledDate: input.scheduledDate,
    startedAt: null,
    completedAt: null,
    status: "not_started",
    overallEffort: null,
    painReported: false,
    dizzinessReported: false,
    shortnessOfBreathReported: false,
    notes: "",
    createdAt: now,
    updatedAt: now,
  });
}

export function buildExerciseSession(input: {
  template: WorkoutTemplate;
  order: number;
  previousWeight: number | null;
  weightUnit: "lb" | "kg" | null;
  now?: Date;
}): ExerciseSession {
  const t = input.template.exercises.find((e) => e.order === input.order);
  if (!t) throw new Error(`No template exercise at order ${input.order}`);
  const now = input.now ?? new Date();
  return exerciseSessionSchema.parse({
    exerciseKey: t.key,
    exerciseName: t.name,
    exerciseOrder: t.order,
    targetSets: t.targetSets,
    targetRepsMin: t.targetRepsMin,
    targetRepsMax: t.targetRepsMax,
    weightUsed: t.kind === "resistance" ? input.previousWeight : null,
    weightUnit: t.kind === "resistance" ? input.weightUnit : null,
    difficulty: null,
    painStatus: null,
    completed: false,
    durationMinutes: t.durationMinutes,
    previousWeight: input.previousWeight,
    aiSuggestedWeight: null,
    aiRecommendationId: null,
    notes: "",
    createdAt: now,
    updatedAt: now,
  });
}

/** Safety gate: symptoms recorded this session block progression suggestions. */
export function progressionBlocked(input: {
  painReported: boolean;
  dizzinessReported: boolean;
  shortnessOfBreathReported: boolean;
  painStatus: "none" | "mild" | "stopped" | null;
}): boolean {
  return (
    input.painReported ||
    input.dizzinessReported ||
    input.shortnessOfBreathReported ||
    input.painStatus === "stopped"
  );
}
