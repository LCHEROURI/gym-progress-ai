import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

function firebaseChunk(id: string): string | undefined {
  if (!id.includes("/node_modules/")) return undefined;

  const groups: [string, RegExp][] = [
    ["firebase-ai", /\/(?:@firebase\/ai|firebase\/ai)\//],
    ["firebase-auth", /\/(?:@firebase\/auth|firebase\/auth)\//],
    ["firebase-firestore", /\/(?:@firebase\/firestore|firebase\/firestore|@firebase\/webchannel-wrapper)\//],
    ["firebase-messaging", /\/(?:@firebase\/messaging|firebase\/messaging)\//],
    ["firebase-core", /\/(?:@firebase\/(?:app|component|logger|util|installations|heartbeat|platform-logger|app-check-interop-types|auth-interop-types|firestore-interop-types|messaging-interop-types)|firebase\/app)\//],
  ];

  return groups.find(([, pattern]) => pattern.test(id))?.[0];
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks: firebaseChunk },
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["src/test-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
  },
});
