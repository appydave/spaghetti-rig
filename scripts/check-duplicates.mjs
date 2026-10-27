// Fails when the code holds repeated code (G08): src/ in one scan, tests and tooling in another. Run by `npm run lint:duplicates` and the
// Duplicates job in CI.
import { SCANS, runProfile } from "../lint/gates/duplicates.mjs";

const HINTS = {
  production:
    "Move the repeated code into one function or module that both places call. Do not add the file to .jscpd.json: only procedural-data files may be there, and the list is pinned.",
  tests:
    "Move the repeated code into one shared test helper (lint/gates/support/ for the gate tests, tests/helpers.ts for the browser tests) that both tests call. Nothing is ignored in .jscpd.tests.json, and nothing may be.",
};
let failed = false;

for (const [scan, { profiles }] of Object.entries(SCANS)) {
  for (const name of Object.keys(profiles)) {
    const { code, output } = runProfile(name, undefined, scan);

    if (code === 0) {
      console.log(`check-duplicates (${scan} ${name}): no clones`);
    } else {
      failed = true;
      console.error(
        `check-duplicates (${scan} ${name}) failed:\n${output}\n${HINTS[scan]}`,
      );
    }
  }
}

process.exit(failed ? 1 : 0);
