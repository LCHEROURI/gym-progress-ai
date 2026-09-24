import { z } from "zod";

export class EnvError extends Error {
  constructor(readonly missing: string[]) {
    super(`Missing environment configuration: ${missing.join(", ")}`);
    this.name = "EnvError";
  }
}

const KEYS: Record<string, string> = {
  VITE_FIREBASE_API_KEY: "apiKey",
  VITE_FIREBASE_AUTH_DOMAIN: "authDomain",
  VITE_FIREBASE_PROJECT_ID: "projectId",
  VITE_FIREBASE_STORAGE_BUCKET: "storageBucket",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "messagingSenderId",
  VITE_FIREBASE_APP_ID: "appId",
};

const schema = z.object({
  apiKey: z.string().min(1),
  authDomain: z.string().min(1),
  projectId: z.string().min(1),
  storageBucket: z.string().min(1),
  messagingSenderId: z.string().min(1),
  appId: z.string().min(1),
  useEmulator: z.boolean(),
});

export type AppEnv = z.infer<typeof schema>;

export function parseEnv(raw: Record<string, string | undefined>): AppEnv {
  const missing = Object.keys(KEYS).filter((k) => !raw[k]);
  if (missing.length > 0) throw new EnvError(missing);
  const flat = Object.fromEntries(
    Object.entries(KEYS).map(([k, v]) => [v, raw[k] as string]),
  );
  return schema.parse({ ...flat, useEmulator: raw.VITE_USE_EMULATOR === "1" });
}
