import { defineConfig } from "@playwright/test";

const PORT = 5311;

export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    // iPhone SE-class and standard iPhone logical widths.
    { name: "320", use: { viewport: { width: 320, height: 800 } } },
    { name: "390", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/smoke.html`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
