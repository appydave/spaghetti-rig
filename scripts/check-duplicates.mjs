// Fails when src/ holds repeated code (G08). Run by `npm run lint:duplicates` and the Duplicates job in CI.
import { PROFILES, runProfile } from "../lint/gates/duplicates.mjs";

const HINT =
  "Move the repeated code into one function or module that both places call. Do not add the file to .jscpd.json: only procedural-data files may be there, and the list is pinned.";
let failed = false;

for (const name of Object.keys(PROFILES)) {
  const { code, output } = runProfile(name);

  if (code === 0) {
    console.log(`check-duplicates (${name}): no clones`);
  } else {
    failed = true;
    console.error(`check-duplicates (${name}) failed:\n${output}\n${HINT}`);
  }
}

process.exit(failed ? 1 : 0);
