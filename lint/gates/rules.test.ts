// Proves the magic-number and colour rules (Omer 104c7cc) are wired: every form fails a planted violation and passes its twin.
// Probes run in a sandbox that mirrors the repo (the real .oxlintrc.json, node_modules and the plugin files), so the rules'
// path logic (tests, the palette module, the asset-data exemption) is exercised as in the repo.
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
import {
  COLOUR,
  COLOUR_PROBES,
  NUMBER,
  NUMBER_PROBES,
  PLANTED,
  type Probe,
} from "./rules-probes";
import { COLOUR_SET_PROBES } from "./colour-set-probes";
import { oxlintIn } from "./sandbox";

const REPO = resolve(import.meta.dirname, "../..");
const GLOB = "*";

type RuleSetting = string | readonly (string | object)[];
type Override = {
  files?: string[];
  excludeFiles?: string[];
  rules?: Record<string, RuleSetting>;
};

/** The repo's lint config, read as JSON: its comments (whole lines starting with //) are dropped first. */
const readConfig = (): { overrides: Override[] } =>
  JSON.parse(
    readFileSync(join(REPO, ".oxlintrc.json"), "utf8").replace(
      /^\s*\/\/.*$/gm,
      "",
    ),
  );
const config = readConfig();

/** The six model files that are asset data (hand-placed geometry and materials), exempt from both rules for good: R7 revised. */
const EXEMPT = [
  "src/world/boss.ts",
  "src/world/characters.ts",
  "src/world/city.ts",
  "src/world/enemies.ts",
  "src/world/gate.ts",
  "src/world/showcase.ts",
];
const BAD_SOURCE =
  'export const n = Math.max(7, 1);\nexport const c = "#ffffff";\n';
/** The override that exempts the asset files from the number and colour rules (the size gate has its own, in size.test.ts). */
const EXEMPTION = (o: Override): boolean =>
  "no-magic-numbers" in (o.rules ?? {}) &&
  (o.files ?? []).some((f) => EXEMPT.includes(f));

const PROBES: readonly Probe[] = [
  ...NUMBER_PROBES,
  ...COLOUR_PROBES,
  ...COLOUR_SET_PROBES,
  ...PLANTED,
  [
    "a new file with a magic number and a hex colour fails both rules",
    "src/world/new-file.ts",
    BAD_SOURCE,
    [NUMBER, COLOUR],
  ],
  ...EXEMPT.map((path): Probe => [
    `the exemption covers ${path}`,
    path,
    BAD_SOURCE,
    [],
  ]),
];

let dir = "";
const found = new Map<string, string[]>();

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "rules-sandbox-"));
  cpSync(join(REPO, ".oxlintrc.json"), join(dir, ".oxlintrc.json"));
  symlinkSync(join(REPO, "node_modules"), join(dir, "node_modules"));
  cpSync(join(REPO, "lint/gates"), join(dir, "lint/gates"), {
    recursive: true,
  });

  for (const [, path, source] of PROBES) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), source);
  }

  for (const p of PROBES) {
    found.set(p[1], []);
  }

  for (const d of oxlintIn(
    dir,
    PROBES.map((p) => p[1]),
  )) {
    if ([NUMBER, COLOUR].includes(d.code)) {
      found.get(d.filename)?.push(d.code);
    }
  }
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("magic numbers and colours gate", () => {
  it.each(PROBES.map((p) => [p[0], p[1], p[3]] as const))(
    "%s",
    (_name, path, expected) => {
      expect([...(found.get(path) ?? [])].sort()).toEqual([...expected].sort());
    },
  );

  it("every rule has a probe that fails and one that passes", () => {
    const failing = new Set(PROBES.flatMap((p) => p[3]));

    expect([NUMBER, COLOUR].filter((c) => !failing.has(c))).toEqual([]);
    expect(PROBES.filter((p) => p[3].length === 0).length).toBeGreaterThan(0);
  });

  it("the not-yet-enforced lists are gone: neither rule excludes a file by name", () => {
    for (const rule of [
      "no-magic-numbers",
      "strict-colors/no-color-literals",
    ]) {
      const named = config.overrides
        .filter((o) => !EXEMPTION(o) && rule in (o.rules ?? {}))
        .flatMap((o) => o.excludeFiles ?? [])
        .filter((f) => !f.includes(GLOB));

      expect(named, rule).toEqual([]);
    }
  });

  it("the exemption names exactly the six asset files, each of which exists", () => {
    const exemptions = config.overrides.filter(EXEMPTION);

    expect(exemptions).toHaveLength(1);
    expect([...(exemptions[0]?.files ?? [])].sort()).toEqual(
      [...EXEMPT].sort(),
    );
    expect(EXEMPT.filter((f) => !existsSync(join(REPO, f)))).toEqual([]);
  });

  it("each exempt file still has a finding with the exemption lifted, so it only names files that need it", () => {
    const guardDir = mkdtempSync(join(tmpdir(), "rules-guard-"));

    try {
      const guard = readConfig();

      guard.overrides = guard.overrides.filter((o) => !EXEMPTION(o));
      writeFileSync(join(guardDir, ".oxlintrc.json"), JSON.stringify(guard));
      symlinkSync(join(REPO, "node_modules"), join(guardDir, "node_modules"));
      cpSync(join(REPO, "lint/gates"), join(guardDir, "lint/gates"), {
        recursive: true,
      });

      for (const f of EXEMPT) {
        mkdirSync(dirname(join(guardDir, f)), { recursive: true });
        cpSync(join(REPO, f), join(guardDir, f));
      }

      const hit = new Set(
        oxlintIn(guardDir, EXEMPT)
          .filter((d) => [NUMBER, COLOUR].includes(d.code))
          .map((d) => d.filename),
      );

      expect(
        EXEMPT.filter((f) => !hit.has(f)),
        "exempt but clean",
      ).toEqual([]);
    } finally {
      rmSync(guardDir, { recursive: true, force: true });
    }
  });

  it("a planted disable comment silences the linter, so the suppression scan must catch it", () => {
    const scanDir = mkdtempSync(join(tmpdir(), "rules-scan-"));

    try {
      for (const [, path, source] of PLANTED) {
        mkdirSync(dirname(join(scanDir, path)), { recursive: true });
        writeFileSync(join(scanDir, path), source);
      }

      spawnSync("git", ["init", "-q"], { cwd: scanDir });

      const scan = spawnSync(
        "node",
        [join(REPO, "scripts/check-no-suppressions.mjs")],
        { cwd: scanDir, encoding: "utf8" },
      );

      expect(scan.status).toBe(1);
      expect(scan.stderr).toContain("src/probe/off-number.ts");
      expect(scan.stderr).toContain("src/probe/off-colour.ts");
    } finally {
      rmSync(scanDir, { recursive: true, force: true });
    }
  });
});
