import { defineConfig } from "vitest/config";

// The port the dev and preview servers listen on, 5173 unless DEV_PORT says otherwise (each desk sharing a machine sets its own).
// playwright.config.ts reads the same variable, so the e2e tests drive this server.
const DEFAULT_DEV_PORT = 5173;
const DEV_PORT = Number(process.env.DEV_PORT ?? DEFAULT_DEV_PORT);
// three.js and the game's code ship in one chunk of about this many kB, so the default 500 kB warning would always fire.
const CHUNK_WARNING_KB = 6000;
// Coverage floors: see the note at `thresholds`.
const STATEMENTS_FLOOR = 83;
const BRANCHES_FLOOR = 68;
const FUNCTIONS_FLOOR = 75;

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
      // Since G04 H1 lint/gates/world-proof.test.ts also plays the whole of PlayerWorld (all six tiers, both players) against a stubbed canvas.
      // That is shallow coverage too, and it must not fall. The floors are now WHOLE numbers, rounded down from the measured 83.79, 68.57 and
      // 75.04: a NAMED DEPARTURE from the one-decimal floors above. G04's splits (W1-W6, D1, A1-A2, C1-C2) restructure code and wobble coverage
      // slightly, and one-decimal floors would turn every small wobble into a ruling. The event this floor must catch is far bigger: the
      // harness being deleted or skipped drops coverage by about 35 points. A floor below these is a lost test and goes to David.
      // G04's closing slice re-ratchets all three to the measured value at one decimal.
      // No lines floor: lines measure layout. Prettier moved them 12.38% -> 10.55% with no code or test change, while statements did not move.
      thresholds: {
        statements: STATEMENTS_FLOOR,
        branches: BRANCHES_FLOOR,
        functions: FUNCTIONS_FLOOR,
      },
    },
  },
});
