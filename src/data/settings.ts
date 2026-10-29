import { doc, getDoc, setDoc } from "firebase/firestore";
import { z } from "zod";
import { TEMPLATES } from "../domain/templates";
import {
  PROFILE_DATE_FIELDS,
  withDateFields,
  type RepoCtx,
} from "./session-repository";

export const extraExerciseSchema = z
  .object({
    key: z.string().min(1).max(60),
    name: z.string().min(1).max(120),
    targetSets: z.number().int().min(1).max(20),
    targetRepsMin: z.number().int().min(1).max(200),
    targetRepsMax: z.number().int().min(1).max(200),
    tip: z.string().max(500),
  })
  .strict();

export type ExtraExercise = z.infer<typeof extraExerciseSchema>;

export function slugifyExercise(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "exercise";
}

export function createCustomExerciseKey(
  name: string,
  existingKeys: Iterable<string>,
): string {
  const baseKey = `custom-${slugifyExercise(name)}`;
  const keys = new Set(existingKeys);
  if (!keys.has(baseKey)) return baseKey;
  let counter = 2;
  while (keys.has(`${baseKey}-${counter}`)) {
    counter++;
  }
  return `${baseKey}-${counter}`;
}

/** Mirrors the settings/profile rules exactly (strict, full-doc writes). */
export const profileSchema = z
  .object({
    displayName: z.string().max(60),
    weightUnit: z.enum(["lb", "kg"]),
    defaultRestSeconds: z.union([z.literal(60), z.literal(75), z.literal(90)]),
    aiRecommendationsEnabled: z.boolean(),
    largeTextEnabled: z.boolean(),
    machineIncrements: z
      .record(z.number().min(0.5).max(100))
      .refine((m) => Object.keys(m).length <= 50, { message: "at most 50 machines" }),
    reminderTimes: z
      .record(z.string().regex(/^\d{2}:\d{2}$/))
      .refine((m) => Object.keys(m).length <= 3, { message: "mon/wed/fri only" }),
    extraExercises: z.array(extraExerciseSchema).max(20).default([]),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

export type Profile = z.infer<typeof profileSchema>;

/** Unique resistance machines across the three templates. */
export const RESISTANCE_MACHINES: { key: string; name: string }[] = [
  ...new Map(
    TEMPLATES.flatMap((t) => t.exercises)
      .filter((e) => e.kind === "resistance")
      .map((e) => [e.key, { key: e.key, name: e.name }]),
  ).values(),
];

export function defaultProfile(now: Date = new Date()): Profile {
  return profileSchema.parse({
    displayName: "",
    weightUnit: "lb",
    defaultRestSeconds: 75,
    aiRecommendationsEnabled: true,
    largeTextEnabled: true,
    machineIncrements: {},
    reminderTimes: { mon: "09:00", wed: "09:00", fri: "09:00" },
    extraExercises: [],
    createdAt: now,
    updatedAt: now,
  });
}

const path = (uid: string) => `users/${uid}/settings/profile`;

export async function fetchProfile(ctx: RepoCtx, uid: string): Promise<Profile> {
  const snap = await getDoc(doc(ctx.db, path(uid)));
  return snap.data()
    ? profileSchema.parse(withDateFields(snap.data(), PROFILE_DATE_FIELDS))
    : defaultProfile();
}

export async function saveProfile(
  ctx: RepoCtx,
  uid: string,
  profile: Profile,
): Promise<void> {
  const validated = profileSchema.parse(profile);
  await setDoc(
    doc(ctx.db, path(uid)),
    validated as unknown as Record<string, unknown>,
  );
}
