// The duplicate-code gate (G08): jscpd run over src/ in two profiles, with the scope in .jscpd.json, and over tests and tooling in two
// more, with the scope in .jscpd.tests.json (G08b). One home for the profiles, so
// `npm run lint:duplicates` and the gate's probes (duplicates.test.ts) use the same flags.
//   exact: the same code after comments and spacing. 40 tokens (a departure from Omer's 53, which finds nothing here); jscpd reports a
//     clone's lines including the line it starts on, and wants more than 5 of them.
//   similar: near-miss, the same syntax tree with other names or values, and gaps of up to 12 lines inside a copy.
//     Omer's 0.90 (he raised it from 0.75, which pushed different routines into one generic one).
// The tests-and-tooling scan reads src (test files included), tests/, lint/ and scripts/, with no ignore list at all.
//   exact: Omer's own 53 tokens and more than 9 lines. All 7 pairs it found here were real, and each was shared.
//   similar: 0.95, with gaps of up to 3 lines, not 12. The gap merge is what finds near-copies in tests, and it ignores --similarity; at
//     12 lines it also joins unlike code (rules.test.ts, 0.58), at 3 every pair it found was shared.
// The renamed and identifier profiles are not run: on this game they flag only G05's named constants (27 of 27 pairs false).
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export const REPO = resolve(import.meta.dirname, "../..");

const JSCPD = resolve(REPO, "node_modules/.bin/jscpd");
/** The most output of one jscpd run read back: 2 to the power of this many bytes. */
const OUTPUT_BITS = 26;
const MAX_OUTPUT_BYTES = 1 << OUTPUT_BITS;

export const PROFILES = {
  exact: ["--kind", "exact", "--min-tokens", "40", "--min-lines", "5"],
  similar: [
    "--kind",
    "similar,gap,ast",
    "--similarity",
    "0.90",
    "--min-nodes",
    "1",
    "--max-gap-lines",
    "12",
    "--min-tokens",
    "19",
    "--min-lines",
    "5",
  ],
};

export const TEST_PROFILES = {
  exact: ["--kind", "exact", "--min-tokens", "53", "--min-lines", "9"],
  similar: [
    "--kind",
    "similar,gap,ast",
    "--similarity",
    "0.95",
    "--min-nodes",
    "1",
    "--max-gap-lines",
    "3",
    "--min-tokens",
    "19",
    "--min-lines",
    "5",
  ],
};

/** The two scans: where each reads its scope from, and its profiles. */
export const SCANS = {
  production: { config: ".jscpd.json", profiles: PROFILES },
  tests: { config: ".jscpd.tests.json", profiles: TEST_PROFILES },
};

/** One profile of one scan run in `cwd` with the config file there: the exit code (0 means no clone and at least one file read) and what jscpd printed. */
export function runProfile(name, cwd = REPO, scan = "production") {
  const { config, profiles } = SCANS[scan];
  const run = spawnSync(JSCPD, ["--config", config, ...profiles[name]], {
    cwd,
    encoding: "utf8",
    maxBuffer: MAX_OUTPUT_BYTES,
  });

  return { code: run.status ?? 1, output: `${run.stdout}${run.stderr}` };
}
