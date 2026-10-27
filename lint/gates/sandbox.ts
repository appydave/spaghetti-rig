// The sandbox the gate tests lint in: the real .oxlintrc.json, the plugin files in lint/gates and node_modules, plus whatever files a
// test plants. Shared by size.test.ts and complexity.test.ts, so a gate's wiring is checked the same way for every gate.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const REPO = resolve(import.meta.dirname, "../..");

const OXLINT = join(REPO, "node_modules/.bin/oxlint");

/** The most output of one oxlint run read back: 2 to the power of this many bytes. */
const OUTPUT_BITS = 28;
const MAX_OUTPUT = 1 << OUTPUT_BITS;

/** What a rule is set to in the config: its level on its own ("off"), or the level with its options. */
type RuleSetting = string | readonly (string | number | object)[];

export type Override = {
  files?: string[];
  rules?: Record<string, RuleSetting>;
};
export type Config = { overrides: Override[] };
export type Finding = { code: string; filename: string };

/** The repo's lint config, read as JSON: its comments (whole lines starting with //) are dropped first. */
export const readConfig = (): Config =>
  JSON.parse(
    readFileSync(join(REPO, ".oxlintrc.json"), "utf8").replaceAll(
      /^\s*\/\/.*$/gm,
      "",
    ),
  );

/** Run oxlint with the .oxlintrc.json in `cwd` over these files, and give back its findings. */
export function oxlintIn(cwd: string, files: readonly string[]): Finding[] {
  const run = spawnSync(
    OXLINT,
    ["-c", ".oxlintrc.json", "-f", "json", ...files],
    {
      cwd,
      encoding: "utf8",
      maxBuffer: MAX_OUTPUT,
    },
  );
  const report: { diagnostics: Finding[] } = JSON.parse(run.stdout);

  return report.diagnostics;
}

/** Lint these files in a sandbox holding the given config; the findings with one of these codes, by file. */
export function lintIn(
  sandbox: string,
  cfg: Config,
  files: readonly string[],
  codes: readonly string[],
): Map<string, string[]> {
  writeFileSync(join(sandbox, ".oxlintrc.json"), JSON.stringify(cfg));
  symlinkSync(join(REPO, "node_modules"), join(sandbox, "node_modules"));
  cpSync(join(REPO, "lint/gates"), join(sandbox, "lint/gates"), {
    recursive: true,
  });

  const byFile = new Map<string, string[]>(files.map((f) => [f, []]));

  for (const d of oxlintIn(sandbox, files)) {
    if (codes.includes(d.code)) {
      byFile.get(d.filename)?.push(d.code);
    }
  }

  return byFile;
}

/** The findings, with one of these codes, of repo files when the config has had the given override blocks taken out. */
export function findingsWithout(
  blocks: Override[],
  files: readonly string[],
  codes: readonly string[],
): Map<string, string[]> {
  const sandbox = mkdtempSync(join(tmpdir(), "gate-guard-"));

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

    return lintIn(sandbox, cfg, files, codes);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}
