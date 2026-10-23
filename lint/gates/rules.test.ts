// Proves the magic-number and colour rules (Omer 104c7cc) are wired: every form fails a planted violation and passes its twin.
// Probes run in a sandbox that mirrors the repo (the real .oxlintrc.json, node_modules and the plugin files), so the rules'
// path logic (tests, the palette module, the not-yet-enforced lists) is exercised as in the repo.
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

const REPO = resolve(import.meta.dirname, "../..");
const OXLINT = join(REPO, "node_modules/.bin/oxlint");
const GLOB = "*";
/** oxlint prints one JSON diagnostic per finding; the listed files have thousands, more than the default 1 MB pipe buffer. */
const MAX_OUTPUT = 1 << 28;

type RuleSetting = string | readonly (string | object)[];
type Override = {
  excludeFiles?: string[];
  rules?: Record<string, RuleSetting>;
};

const config: { overrides: Override[] } = JSON.parse(
  readFileSync(join(REPO, ".oxlintrc.json"), "utf8"),
);

/** The files a rule is not yet enforced on: the work queue that shrinks until the gate closes. */
const notYetEnforced = (rule: string): string[] =>
  (
    config.overrides.find((o) => rule in (o.rules ?? {}))?.excludeFiles ?? []
  ).filter((f) => !f.includes(GLOB));

const listed = (name: string, rule: string, source: string): Probe[] => {
  const path = notYetEnforced(rule)[0];

  return path ? [[name, path, source, []]] : [];
};

const PROBES: readonly Probe[] = [
  ...NUMBER_PROBES,
  ...COLOUR_PROBES,
  ...PLANTED,
  ...listed(
    "number: a file on the not-yet-enforced list is skipped",
    "no-magic-numbers",
    "export const x = 7;\n",
  ),
  ...listed(
    "colour: a file on the not-yet-enforced list is skipped",
    "strict-colors/no-color-literals",
    'export const c = "#ffffff";\nexport const d = new Color("#ffffff");\n',
  ),
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

  const run = spawnSync(
    OXLINT,
    ["-c", ".oxlintrc.json", "-f", "json", ...PROBES.map((p) => p[1])],
    { cwd: dir, encoding: "utf8" },
  );
  const parsed = JSON.parse(run.stdout) as {
    diagnostics: { code: string; filename: string }[];
  };

  for (const p of PROBES) {
    found.set(p[1], []);
  }

  for (const d of parsed.diagnostics) {
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

  it("every file on a not-yet-enforced list still has a finding, so a list only names files that need it", () => {
    const guardDir = mkdtempSync(join(tmpdir(), "rules-guard-"));

    try {
      const guard: { overrides: Override[] } = JSON.parse(
        readFileSync(join(REPO, ".oxlintrc.json"), "utf8"),
      );
      const rules: [string, string][] = [
        ["no-magic-numbers", NUMBER],
        ["strict-colors/no-color-literals", COLOUR],
      ];

      // The same config with only the file names taken off the lists (the tests globs stay).
      for (const o of guard.overrides) {
        if (rules.some(([rule]) => rule in (o.rules ?? {}))) {
          o.excludeFiles = (o.excludeFiles ?? []).filter((f) =>
            f.includes(GLOB),
          );
        }
      }

      writeFileSync(join(guardDir, ".oxlintrc.json"), JSON.stringify(guard));
      symlinkSync(join(REPO, "node_modules"), join(guardDir, "node_modules"));
      cpSync(join(REPO, "lint/gates"), join(guardDir, "lint/gates"), {
        recursive: true,
      });

      const listed = new Set(rules.flatMap(([rule]) => notYetEnforced(rule)));

      for (const f of listed) {
        mkdirSync(dirname(join(guardDir, f)), { recursive: true });
        cpSync(join(REPO, f), join(guardDir, f));
      }

      const run = spawnSync(
        OXLINT,
        ["-c", ".oxlintrc.json", "-f", "json", ...listed],
        { cwd: guardDir, encoding: "utf8", maxBuffer: MAX_OUTPUT },
      );
      const parsed = JSON.parse(run.stdout) as {
        diagnostics: { code: string; filename: string }[];
      };

      for (const [rule, code] of rules) {
        const hit = new Set(
          parsed.diagnostics
            .filter((d) => d.code === code)
            .map((d) => d.filename),
        );

        expect(
          notYetEnforced(rule).filter((f) => !hit.has(f)),
          `${rule}: listed but clean`,
        ).toEqual([]);
      }
    } finally {
      rmSync(guardDir, { recursive: true, force: true });
    }
  });

  it("the not-yet-enforced lists only name files that exist", () => {
    for (const rule of [
      "no-magic-numbers",
      "strict-colors/no-color-literals",
    ]) {
      expect(
        notYetEnforced(rule).filter((f) => !existsSync(join(REPO, f))),
      ).toEqual([]);
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
