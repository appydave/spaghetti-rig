// Proves the complexity gate (G06) is wired and kept honest. The probes run in a sandbox that mirrors the repo (the real .oxlintrc.json,
// the plugin files, node_modules): each limit fails just over it and passes exactly on it. The guards keep the two ways out of the gate
// honest: the procedural-data exemption is exactly the files named here, each of which exists and still needs it; the complexity
// carry to tier 5 is closed and stays closed.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COGNITIVE,
  COMPLEXITY_CODES,
  COMPLEXITY_PROBES,
  cognitive,
} from "./complexity-probes";
import { ASSET_DATA } from "./exemptions";
import { REPO, findingsWithout, readConfig, type Override } from "./sandbox";
import { describeProbes } from "./support/probe-gate";

/** The procedural-data files that still have a builder the rules would flag: the Gate constructor (cognitive 13) is hand-placed geometry written as code. */
const COMPLEXITY_PD = ["src/world/models/gate.ts"];
const COMPLEXITY_RULES = [
  "anti-slop/cognitive-complexity",
  "anti-slop/cyclomatic-complexity",
  "sonarjs/expression-complexity",
];
/** A carried-for-size file with no complexity finding: it is fully under this gate. */
const CARRIED_FOR_SIZE_ONLY = "tests/show.spec.ts";
const OVER = cognitive(9);

const config = readConfig();
const turnsComplexityOff = (o: Override): boolean =>
  (o.files ?? []).length > 0 &&
  COMPLEXITY_RULES.some((r) => o.rules?.[r] === "off");
const exemptions = config.overrides.filter(turnsComplexityOff);
const pdBlocks = exemptions.filter((o) =>
  (o.files ?? []).some((f) => ASSET_DATA.includes(f)),
);
const carriedBlocks = exemptions.filter((o) => !pdBlocks.includes(o));
const pd = pdBlocks.flatMap((o) => o.files ?? []);

const covered = [
  ...COMPLEXITY_PD.map(
    (path): readonly [string, string, string, readonly string[]] => [
      `the procedural-data exemption covers ${path}`,
      path,
      OVER,
      [],
    ],
  ),
  [
    "a file carried only for size is not skipped: the complexity list is its own",
    CARRIED_FOR_SIZE_ONLY,
    OVER,
    [COGNITIVE],
  ],
] as const;
const PROBES = [...COMPLEXITY_PROBES, ...covered.filter((p) => p[1] !== "")];

describeProbes("complexity", PROBES, COMPLEXITY_CODES);

describe("complexity gate", () => {
  it("the procedural-data exemption is exactly the files named here, in one block, each of which exists", () => {
    expect(pdBlocks).toHaveLength(1);
    expect([...pd].sort()).toEqual([...COMPLEXITY_PD].sort());
    expect(COMPLEXITY_PD.filter((f) => !existsSync(join(REPO, f)))).toEqual([]);
  });

  it("the procedural-data exemption only names asset-data files", () => {
    expect(COMPLEXITY_PD.filter((f) => !ASSET_DATA.includes(f))).toEqual([]);
  });

  it("the complexity carry to tier 5 is closed: no block switches a complexity rule off for a carried file, and none may again", () => {
    expect(carriedBlocks).toEqual([]);
  });

  it("no other block switches a complexity rule off", () => {
    expect(exemptions).toEqual(pdBlocks);
    expect(exemptions).toHaveLength(1);
  });

  it("every exempt file still has a complexity finding without its block, so a name leaves the list the moment its file is clean", () => {
    const hit = findingsWithout(pdBlocks, pd, COMPLEXITY_CODES);

    expect(pd.filter((f) => hit.get(f)?.length === 0)).toEqual([]);
  });
});
