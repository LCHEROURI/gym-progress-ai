import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "./env";

const complete = {
  VITE_FIREBASE_API_KEY: "k",
  VITE_FIREBASE_AUTH_DOMAIN: "a.example",
  VITE_FIREBASE_PROJECT_ID: "gym-progress-ai-lcherouri",
  VITE_FIREBASE_STORAGE_BUCKET: "b",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "1",
  VITE_FIREBASE_APP_ID: "app",
  VITE_USE_EMULATOR: "0",
};

describe("parseEnv", () => {
  it("parses a complete environment", () => {
    const env = parseEnv(complete);
    expect(env.projectId).toBe("gym-progress-ai-lcherouri");
    expect(env.useEmulator).toBe(false);
  });

  it("reads VITE_USE_EMULATOR=1 as true", () => {
    expect(parseEnv({ ...complete, VITE_USE_EMULATOR: "1" }).useEmulator).toBe(true);
  });

  it("throws EnvError naming every missing key", () => {
    try {
      parseEnv({ VITE_FIREBASE_API_KEY: "k" });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      expect((e as EnvError).missing).toContain("VITE_FIREBASE_PROJECT_ID");
      expect((e as EnvError).missing).toContain("VITE_FIREBASE_APP_ID");
    }
  });
});
