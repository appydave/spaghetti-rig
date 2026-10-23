import { defineConfig } from "vitest/config";

// The port the dev and preview servers listen on; playwright.config.ts points the e2e tests at the same one.
const DEV_PORT = 5173;
// three.js and the game's code ship in one chunk of about this many kB, so the default 500 kB warning would always fire.
const CHUNK_WARNING_KB = 6000;
// Coverage floors: see the note at `thresholds`.
const STATEMENTS_FLOOR = 11.1;
const BRANCHES_FLOOR = 17.6;
const FUNCTIONS_FLOOR = 17.5;

export default defineConfig({
  // Listen on the network so another machine (e.g. the stage Mac) can open it by name:
  // Bonjour names (roamy.local) and Tailscale MagicDNS names (*.ts.net) are allowed.
  server: { port: DEV_PORT, host: true, allowedHosts: [".local", ".ts.net"] },
  preview: { port: DEV_PORT, host: true, allowedHosts: [".local", ".ts.net"] },
  build: { target: "es2022", chunkSizeWarningLimit: CHUNK_WARNING_KB },
  test: {
    include: ["src/**/*.test.ts", "lint/**/*.test.ts"],
    environment: "node",
    coverage: {
      // Count every source file, not only the ones a test imports, so an untested file lowers the numbers.
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      // The floor is the measured coverage on 2026-10-23 rounded down to one decimal: it fails if coverage falls.
      // No lines floor: lines measure layout. Prettier moved them 12.38% -> 10.55% with no code or test change,
      // while statements (the same code) did not move.
      thresholds: {
        statements: STATEMENTS_FLOOR,
        branches: BRANCHES_FLOOR,
        functions: FUNCTIONS_FLOOR,
      },
    },
  },
});
