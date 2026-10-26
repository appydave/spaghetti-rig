// Proves the complexity gate (G06) is wired and kept honest. The probes run in a sandbox that mirrors the repo (the real .oxlintrc.json,
// the plugin files, node_modules): each limit fails just over it and passes exactly on it. The guards keep the two ways out of the gate
// honest: the procedural-data exemption is exactly the files named here, and the list carried to tier 5 is exactly the files named here,
// each of which exists and still needs it.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  COGNITIVE,
  COMPLEXITY_CODES,
  COMPLEXITY_PROBES,
  cognitive,
} from "./complexity-probes";
import { ASSET_DATA, CARRIED_TO_TIER_5 } from "./exemptions";
import {
  REPO,
  findingsWithout,
  lintIn,
  readConfig,
  type Override,
} from "./sandbox";

/** The procedural-data files that still have a builder the rules would flag: the Gate constructor (cognitive 13) is hand-placed geometry written as code. */
const COMPLEXITY_PD = ["src/world/gate.ts"];
/** The files carried to tier 5 (David, scope B, 2026-10-26) that still have a complexity finding. The list may shrink, never grow. */
const COMPLEXITY_CARRIED = [
  "lint/gates/audio-proof.test.ts",
  "src/audio/audio.ts",
  "src/audio/tracks.ts",
  "src/content/load.ts",
  "src/main.ts",
  "src/show/director.ts",
  "src/show/script.ts",
  "src/world/codelayout.ts",
  "src/world/codewindow.ts",
  "src/world/effects.ts",
  "src/world/physics.ts",
  "src/world/toon.ts",
  "src/world/world.ts",
];
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
const carried = carriedBlocks.flatMap((o) => o.files ?? []);
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
  ["a file on the carried list is skipped", carried[0] ?? "", OVER, []],
  [
    "a file carried only for size is not skipped: the complexity list is its own",
    CARRIED_FOR_SIZE_ONLY,
    OVER,
    [COGNITIVE],
  ],
] as const;
const PROBES = [...COMPLEXITY_PROBES, ...covered.filter((p) => p[1] !== "")];
let found = new Map<string, string[]>();
let sandbox = "";

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "complexity-sandbox-"));

  for (const [, path, source] of PROBES) {
    mkdirSync(dirname(join(sandbox, path)), { recursive: true });
    writeFileSync(join(sandbox, path), source);
  }

  found = lintIn(
    sandbox,
    readConfig(),
    PROBES.map((p) => p[1]),
    COMPLEXITY_CODES,
  );
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("complexity gate", () => {
  it.each(PROBES.map((p) => [p[0], p[1], p[3]] as const))(
    "%s",
    (_name, path, expected) => {
      expect([...(found.get(path) ?? [])].sort()).toEqual([...expected].sort());
    },
  );

  it("every complexity rule has a probe that fails and one that passes", () => {
    const failing = new Set(PROBES.flatMap((p) => p[3]));

    expect(COMPLEXITY_CODES.filter((c) => !failing.has(c))).toEqual([]);
    expect(PROBES.filter((p) => p[3].length === 0).length).toBeGreaterThan(0);
  });

  it("the procedural-data exemption is exactly the files named here, in one block, each of which exists", () => {
    expect(pdBlocks).toHaveLength(1);
    expect([...pd].sort()).toEqual([...COMPLEXITY_PD].sort());
    expect(COMPLEXITY_PD.filter((f) => !existsSync(join(REPO, f)))).toEqual([]);
  });

  it("the procedural-data exemption only names asset-data files", () => {
    expect(COMPLEXITY_PD.filter((f) => !ASSET_DATA.includes(f))).toEqual([]);
  });

  it("the list carried to tier 5 is exactly the files named in this test, so no file can join it", () => {
    expect(carriedBlocks).toHaveLength(1);
    expect([...carried].sort()).toEqual([...COMPLEXITY_CARRIED].sort());
  });

  it("the carried list names real files that are carried to tier 5, never a pattern and never an asset file", () => {
    expect(
      carried.filter(
        (f) =>
          f.includes("*") ||
          !existsSync(join(REPO, f)) ||
          !CARRIED_TO_TIER_5.includes(f) ||
          ASSET_DATA.includes(f),
      ),
    ).toEqual([]);
  });

  it("no other block switches a complexity rule off", () => {
    expect(exemptions).toHaveLength(pdBlocks.length + carriedBlocks.length);
    expect(exemptions).toHaveLength(2);
  });

  it("every exempt file still has a complexity finding without its block, so a name leaves the list the moment its file is clean", () => {
    const hit = findingsWithout(pdBlocks, pd, COMPLEXITY_CODES);
    const hitCarried = findingsWithout(
      carriedBlocks,
      carried,
      COMPLEXITY_CODES,
    );

    expect(pd.filter((f) => hit.get(f)?.length === 0)).toEqual([]);
    expect(carried.filter((f) => hitCarried.get(f)?.length === 0)).toEqual([]);
  });
});
