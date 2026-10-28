import { defineConfig } from "vitest/config";

// The port the dev and preview servers listen on, 5173 unless DEV_PORT says otherwise (each desk sharing a machine sets its own).
// playwright.config.ts reads the same variable, so the e2e tests drive this server.
const DEFAULT_DEV_PORT = 5173;
const DEV_PORT = Number(process.env.DEV_PORT ?? DEFAULT_DEV_PORT);
// three.js and the game's code ship in one chunk of about this many kB, so the default 500 kB warning would always fire.
const CHUNK_WARNING_KB = 6000;
// Coverage: the most statements, branches and functions that may be left uncovered, and the percentage backstop. See `thresholds`.
const MAX_UNCOVERED_STATEMENTS = 325;
const MAX_UNCOVERED_BRANCHES = 268;
const MAX_UNCOVERED_FUNCTIONS = 70;
const BACKSTOP_STATEMENTS = 91.6;
const BACKSTOP_BRANCHES = 82.5;
const BACKSTOP_FUNCTIONS = 87.7;

export default defineConfig({
  // Listen on the network so another machine (e.g. the stage Mac) can open it by name:
  // Bonjour names (roamy.local) and Tailscale MagicDNS names (*.ts.net) are allowed.
  server: {
    port: DEV_PORT,
    // A taken port is an error, never a quiet slide to the next free one: a test must not end up on somebody else's server.
    strictPort: true,
    host: true,
    allowedHosts: [".local", ".ts.net"],
  },
  preview: {
    port: DEV_PORT,
    strictPort: true,
    host: true,
    allowedHosts: [".local", ".ts.net"],
  },
  build: { target: "es2022", chunkSizeWarningLimit: CHUNK_WARNING_KB },
  test: {
    include: ["src/**/*.test.ts", "lint/**/*.test.ts"],
    environment: "node",
    coverage: {
      // Count every source file, not only the ones a test imports, so an untested file lowers the numbers.
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      // The ratchet is the UNCOVERED COUNT (David's ruling B, 2026-10-26): CI fails if the number of uncovered statements, branches or
      // functions grows. A negative threshold is Vitest's "most uncovered items allowed", so -441 means at most 441 statements uncovered.
      // Deleting covered code leaves the count where it was and fails nothing; adding code no test runs raises it and fails. The numbers are
      // the counts measured on main at 1186929 (the MAX_UNCOVERED_* constants above). When a PR lowers a count, lower the constant to the new
      // uncovered total (total minus covered, from `npx vitest run --coverage`) in the same PR, so the count only ever shrinks.
      // The percentages below are a backstop, not the gate: the G04-close values, 91.6 / 82.5 / 87.7, over everything under src/.
      // A figure below them is a lost test and goes to David. No lines threshold: lines measure layout (Prettier moved them 12.38% -> 10.55%).
      thresholds: {
        statements: -MAX_UNCOVERED_STATEMENTS,
        branches: -MAX_UNCOVERED_BRANCHES,
        functions: -MAX_UNCOVERED_FUNCTIONS,
        "src/**/*.ts": {
          statements: BACKSTOP_STATEMENTS,
          branches: BACKSTOP_BRANCHES,
          functions: BACKSTOP_FUNCTIONS,
        },
      },
    },
  },
});
