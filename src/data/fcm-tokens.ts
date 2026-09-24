import { doc, setDoc } from "firebase/firestore";
import { z } from "zod";
import type { RepoCtx } from "./session-repository";

/** Mirrors the fcmTokens rules exactly (strict, owner-managed). */
export const fcmTokenSchema = z
  .object({
    id: z.string().min(1).max(128),
    token: z.string().min(1).max(4096),
    timeZone: z.string().min(1).max(64),
    platform: z.literal("web"),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

export type FcmToken = z.infer<typeof fcmTokenSchema>;

/** Stable id per token so re-registering refreshes instead of duplicating. */
export function tokenIdFor(token: string): string {
  let hash = 5381;
  for (let i = 0; i < token.length; i += 1) {
    hash = ((hash * 33) ^ token.charCodeAt(i)) >>> 0;
  }
  return `t${hash.toString(36)}`;
}

const path = (uid: string, id: string) => `users/${uid}/fcmTokens/${id}`;

/**
 * Register (or refresh) this device's push token. The timeZone is the device's
 * own zone so reminder times fire at the device's wall clock. Zod-validated
 * before any write leaves the device.
 */
export async function saveFcmToken(
  ctx: RepoCtx,
  uid: string,
  input: { token: string; timeZone: string },
  now: Date = new Date(),
): Promise<FcmToken> {
  const id = tokenIdFor(input.token);
  const validated = fcmTokenSchema.parse({
    id,
    token: input.token,
    timeZone: input.timeZone,
    platform: "web",
    createdAt: now,
    updatedAt: now,
  });
  await setDoc(
    doc(ctx.db, path(uid, id)),
    validated as unknown as Record<string, unknown>,
  );
  return validated;
}
