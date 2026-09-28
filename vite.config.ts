import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import { bootProbeScript } from "./src/shared/boot-probe";

const buildId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);

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

/**
 * Inlines the pre-React boot probe into index.html and stamps the build ID
 * into a meta tag the probe reads at runtime.
 *
 * This runs in dev too, so the probe is exercised locally rather than only in
 * production. It is injected *before* the entry module so it is installed
 * before any app code can fail.
 */
function bootProbePlugin(): Plugin {
  const buildMeta = `<meta name="app-build-id" content="${buildId}" />`;
  const probe = `<script>${bootProbeScript}</script>`;
  return {
    name: "gym-boot-probe",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html
          .replace("%APP_BUILD_ID_META%", buildMeta)
          .replace("%BOOT_PROBE%", probe);
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), bootProbePlugin()],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
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
