// Proves the size gate (G04) is wired and kept honest. The probes run in a sandbox that mirrors the repo (the real .oxlintrc.json, the
// plugin files, node_modules): each limit fails just over it and passes exactly on it. The guard keeps the two ways out of the gate
// honest: the asset-data exemption is exactly six files, and the list carried to tier 5 is exactly the files named here, each of which
// exists and still needs it.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SIZE_CODES, SIZE_PROBES, fn, file } from "./size-probes";

const REPO = resolve(import.meta.dirname, "../..");
const OXLINT = join(REPO, "node_modules/.bin/oxlint");
const MAX_OUTPUT = 1 << 28;
/** The six model files that are asset data (hand-placed geometry and materials): exempt from the size rules for good. */
const ASSET_DATA = [
  "src/world/boss.ts",
  "src/world/characters.ts",
  "src/world/city.ts",
  "src/world/enemies.ts",
  "src/world/gate.ts",
  "src/world/showcase.ts",
];
/** The files carried to tier 5 (structure) by David's option 2, 10-24: they still exceed a size limit and tier 5 splits them. The list may shrink, never grow. */
const CARRIED_TO_TIER_5 = [
  "lint/gates/audio-proof.test.ts",
  "lint/gates/color-policy.mjs",
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
  "tests/show.spec.ts",
];
const OVER_FILE = file(301);

type Override = { files?: string[]; rules?: Record<string, string> };
type Finding = { code: string; filename: string };

/** The repo's lint config, read as JSON: its comments (whole lines starting with //) are dropped first. */
const readConfig = (): { overrides: Override[] } =>
  JSON.parse(
    readFileSync(join(REPO, ".oxlintrc.json"), "utf8").replace(
      /^\s*\/\/.*$/gm,
      "",
    ),
  );

const config = readConfig();
const turnsSizeOff = (o: Override): boolean =>
  (o.files ?? []).length > 0 && o.rules?.["max-lines"] === "off";
const exemption = config.overrides.filter(
  (o) => turnsSizeOff(o) && (o.files ?? []).some((f) => ASSET_DATA.includes(f)),
);
const notYetEnforced = config.overrides
  .filter((o) => turnsSizeOff(o) && !exemption.includes(o))
  .flatMap((o) => o.files ?? []);

/** Lint these files in a sandbox holding the given config and copies of the given repo files; the size findings, by file. */
function lint(
  sandbox: string,
  cfg: { overrides: Override[] },
  files: readonly string[],
): Map<string, string[]> {
  writeFileSync(join(sandbox, ".oxlintrc.json"), JSON.stringify(cfg));
  symlinkSync(join(REPO, "node_modules"), join(sandbox, "node_modules"));
  cpSync(join(REPO, "lint/gates"), join(sandbox, "lint/gates"), {
    recursive: true,
  });

  const run = spawnSync(
    OXLINT,
    ["-c", ".oxlintrc.json", "-f", "json", ...files],
    {
      cwd: sandbox,
      encoding: "utf8",
      maxBuffer: MAX_OUTPUT,
    },
  );
  const byFile = new Map<string, string[]>(files.map((f) => [f, []]));

  for (const d of (JSON.parse(run.stdout) as { diagnostics: Finding[] })
    .diagnostics) {
    if (SIZE_CODES.includes(d.code)) {
      byFile.get(d.filename)?.push(d.code);
    }
  }

  return byFile;
}

/** The size findings of repo files when the config has had the given override blocks taken out. */
function findingsWithout(
  blocks: Override[],
  files: readonly string[],
): Map<string, string[]> {
  const sandbox = mkdtempSync(join(tmpdir(), "size-guard-"));

  try {
    const cfg = readConfig();

    cfg.overrides = cfg.overrides.filter(
      (o) =>
        !blocks.some(
          (b) => JSON.stringify(b.files) === JSON.stringify(o.files),
        ),
    );

    for (const f of files) {
      mkdirSync(dirname(join(sandbox, f)), { recursive: true });
      cpSync(join(REPO, f), join(sandbox, f));
    }

    return lint(sandbox, cfg, files);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

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

  found = lint(
    sandbox,
    readConfig(),
    PROBES.map((p) => p[1]),
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
    const hit = findingsWithout(exemption, ASSET_DATA);

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
    );

    expect(notYetEnforced.filter((f) => hit.get(f)?.length === 0)).toEqual([]);
  });
});
