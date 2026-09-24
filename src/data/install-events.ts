import { doc, setDoc } from "firebase/firestore";
import { z } from "zod";
import type { RepoCtx } from "./session-repository";

/** Mirrors the installEvents rules exactly (strict, append-only). */
export const installEventSchema = z
  .object({
    id: z.string().min(1).max(40),
    type: z.enum(["prompt_offered", "prompt_result", "installed"]),
    outcome: z.enum(["accepted", "dismissed"]).nullable(),
    method: z.enum(["browser_prompt", "home_screen"]).nullable(),
    userAgent: z.string().max(400),
    createdAt: z.date(),
  })
  .strict();

export type InstallEvent = z.infer<typeof installEventSchema>;

export interface InstallEventInput {
  type: InstallEvent["type"];
  outcome?: "accepted" | "dismissed";
  method?: "browser_prompt" | "home_screen";
}

let counter = 0;
function newInstallEventId(): string {
  counter += 1;
  return `e${Date.now().toString(36)}${counter}`;
}

const path = (uid: string, id: string) => `users/${uid}/installEvents/${id}`;

/** Append-only install funnel event. Zod-validated before any write. */
export async function recordInstallEvent(
  ctx: RepoCtx,
  uid: string,
  input: InstallEventInput,
  now: Date = new Date(),
): Promise<void> {
  const validated = installEventSchema.parse({
    id: newInstallEventId(),
    type: input.type,
    outcome: input.outcome ?? null,
    method: input.method ?? null,
    userAgent:
      typeof navigator === "undefined" ? "" : navigator.userAgent.slice(0, 400),
    createdAt: now,
  });
  await setDoc(
    doc(ctx.db, path(uid, validated.id)),
    validated as unknown as Record<string, unknown>,
  );
}
