import { defineConfig } from "vitest/config";

// The port the dev and preview servers listen on, 5173 unless DEV_PORT says otherwise (each desk sharing a machine sets its own).
// playwright.config.ts reads the same variable, so the e2e tests drive this server.
const DEFAULT_DEV_PORT = 5173;
const DEV_PORT = Number(process.env.DEV_PORT ?? DEFAULT_DEV_PORT);
// three.js and the game's code ship in one chunk of about this many kB, so the default 500 kB warning would always fire.
const CHUNK_WARNING_KB = 6000;
// Coverage floors: see the note at `thresholds`.
const STATEMENTS_FLOOR = 49.9;
const BRANCHES_FLOOR = 42.4;
const FUNCTIONS_FLOOR = 45.0;

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
      // A floor is a ratchet at the measured coverage (G00b): it fails if coverage falls, and a gate never lowers it; any drop goes to David.
      // Since G05 H most of the coverage comes from lint/gates/model-proof.test.ts, which builds every model: it runs the builders but
      // asserts no visuals, so this coverage is shallow, and it still must not fall. Branches (42.4) and functions (45.0) are rounded down
      // from the measured 42.42 and 45.08. Statements was held at 28.0 while G05 named numbers (a `const X = n` is a statement in modules
      // no test loads); G05's closing PR re-ratcheted it to the measured 49.92, rounded down to 49.9.
      // Since G05 N7h and N7h2 lint/gates/audio-proof.test.ts also runs the whole audio engine (init, every track's instrument voices, the
      // scheduler, the sound effects) against a recording AudioContext. That is shallow coverage too, and it must not fall either: branches
      // (42.4) and functions (45.0) are rounded down from the measured 42.41 and 45.08 (statements measured 47.57 then, re-ratcheted above).
      // No lines floor: lines measure layout. Prettier moved them 12.38% -> 10.55% with no code or test change, while statements did not move.
      thresholds: {
        statements: STATEMENTS_FLOOR,
        branches: BRANCHES_FLOOR,
        functions: FUNCTIONS_FLOOR,
      },
    },
  },
});
