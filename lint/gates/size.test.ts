// Proves the size gate (G04) is wired and kept honest. The probes run in a sandbox that mirrors the repo (the real .oxlintrc.json, the
// plugin files, node_modules): each limit fails just over it and passes exactly on it. The guard keeps the two ways out of the gate
// honest: the asset-data exemption is exactly six files, and the list carried to tier 5 is exactly the files named here, each of which
// exists and still needs it.
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
import { ASSET_DATA, CARRIED_TO_TIER_5 } from "./exemptions";
import {
  REPO,
  findingsWithout,
  lintIn,
  readConfig,
  type Override,
} from "./sandbox";
import { SIZE_CODES, SIZE_PROBES, fn, file } from "./size-probes";

const OVER_FILE = file(301);

const config = readConfig();
const turnsSizeOff = (o: Override): boolean =>
  (o.files ?? []).length > 0 && o.rules?.["max-lines"] === "off";
const exemption = config.overrides.filter(
  (o) => turnsSizeOff(o) && (o.files ?? []).some((f) => ASSET_DATA.includes(f)),
);
const notYetEnforced = config.overrides
  .filter((o) => turnsSizeOff(o) && !exemption.includes(o))
  .flatMap((o) => o.files ?? []);

const covered = [
  ...ASSET_DATA.map(
    (path): readonly [string, string, string, readonly string[]] => [
      `the exemption covers ${path}`,
      path,
      OVER_FILE,
      [],
    ],
  ),
  [
    "a file on the carried list is skipped",
    notYetEnforced[0] ?? "",
    fn(61),
    [],
  ],
] as const;
const PROBES = [...SIZE_PROBES, ...covered.filter((p) => p[1] !== "")];
let found = new Map<string, string[]>();
let sandbox = "";

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "size-sandbox-"));

  for (const [, path, source] of PROBES) {
    mkdirSync(dirname(join(sandbox, path)), { recursive: true });
    writeFileSync(join(sandbox, path), source);
  }

  found = lintIn(
    sandbox,
    readConfig(),
    PROBES.map((p) => p[1]),
    SIZE_CODES,
  );
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("size gate", () => {
  it.each(PROBES.map((p) => [p[0], p[1], p[3]] as const))(
    "%s",
    (_name, path, expected) => {
      expect([...(found.get(path) ?? [])].sort()).toEqual([...expected].sort());
    },
  );

  it("every size rule has a probe that fails and one that passes", () => {
    const failing = new Set(PROBES.flatMap((p) => p[3]));

    expect(SIZE_CODES.filter((c) => !failing.has(c))).toEqual([]);
    expect(PROBES.filter((p) => p[3].length === 0).length).toBeGreaterThan(0);
  });

  it("the exemption is exactly the six asset files, in one block, each of which exists", () => {
    expect(exemption).toHaveLength(1);
    expect([...(exemption[0]?.files ?? [])].sort()).toEqual(
      [...ASSET_DATA].sort(),
    );
    expect(ASSET_DATA.filter((f) => !existsSync(join(REPO, f)))).toEqual([]);
  });

  it("each asset file still has a size finding without the exemption, so it only names files that need it", () => {
    const hit = findingsWithout(exemption, ASSET_DATA, SIZE_CODES);

    expect(ASSET_DATA.filter((f) => hit.get(f)?.length === 0)).toEqual([]);
  });

  it("the list carried to tier 5 is exactly the files named in this test, so no file can join it", () => {
    expect([...notYetEnforced].sort()).toEqual([...CARRIED_TO_TIER_5].sort());
  });

  it("the carried list names real files, never a pattern and never an asset file", () => {
    expect(
      notYetEnforced.filter(
        (f) =>
          f.includes("*") ||
          !existsSync(join(REPO, f)) ||
          ASSET_DATA.includes(f),
      ),
    ).toEqual([]);
  });

  it("every file on the carried list still has a size finding, so a name leaves the list the moment its file is clean", () => {
    const hit = findingsWithout(
      config.overrides.filter((o) => turnsSizeOff(o) && !exemption.includes(o)),
      notYetEnforced,
      SIZE_CODES,
    );

    expect(notYetEnforced.filter((f) => hit.get(f)?.length === 0)).toEqual([]);
  });
});
