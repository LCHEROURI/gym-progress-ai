import { doc, getDoc, setDoc } from "firebase/firestore";
import { z } from "zod";
import { TEMPLATES } from "../domain/templates";
import type { RepoCtx } from "./session-repository";

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
    createdAt: now,
    updatedAt: now,
  });
}

const path = (uid: string) => `users/${uid}/settings/profile`;

export async function fetchProfile(ctx: RepoCtx, uid: string): Promise<Profile> {
  const snap = await getDoc(doc(ctx.db, path(uid)));
  const data = snap.data();
  return data ? profileSchema.parse(data) : defaultProfile();
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
