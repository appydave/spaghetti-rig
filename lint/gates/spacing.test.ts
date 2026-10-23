// Proves the readable-spacing gate (Omer 6b8b7f3 + 3c484f4) is wired: every rule, and every padding-line entry, fails a planted
// violation and passes its fixed twin. Probes run through the repo's real .oxlintrc.json, so changing the config breaks a test.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PLANTED, PROBES, SPACING_CODES, silenced } from "./spacing-probes";

const REPO = resolve(import.meta.dirname, "../..");
const OXLINT = join(REPO, "node_modules/.bin/oxlint");

let dir = "";
const found = new Map<string, string[]>();

/** Lint every probe in one process and group the spacing findings by file. */
function lintAll(files: readonly string[]): Map<string, string[]> {
  const run = spawnSync(
    OXLINT,
    ["-c", join(REPO, ".oxlintrc.json"), "-f", "json", ...files],
    {
      cwd: REPO,
      encoding: "utf8",
    },
  );
  const parsed = JSON.parse(run.stdout) as {
    diagnostics: { code: string; filename: string }[];
  };
  const byFile = new Map<string, string[]>(files.map((f) => [f, []]));

  for (const d of parsed.diagnostics) {
    if (SPACING_CODES.includes(d.code)) {
      byFile.get(d.filename)?.push(d.code);
    }
  }

  return byFile;
}

const probePath = (i: number): string => join(dir, `probe-${i}.ts`);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "spacing-probes-"));

  const files = PROBES.map((p, i) => ({ path: probePath(i), source: p[1] }));

  PLANTED.forEach((comment, i) => {
    files.push({
      path: join(dir, `silenced-${i}.ts`),
      source: silenced(comment),
    });
  });

  for (const f of files) {
    writeFileSync(f.path, f.source);
  }

  for (const [path, codes] of lintAll(files.map((f) => f.path))) {
    found.set(path, codes);
  }
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("readable spacing gate", () => {
  it.each(PROBES.map((p, i) => [p[0], i] as const))("%s", (_name, i) => {
    const expected = [...(PROBES[i]?.[2] ?? [])].sort();

    expect([...(found.get(probePath(i)) ?? [])].sort()).toEqual(expected);
  });

  it("every spacing rule has a probe that fails and one that passes", () => {
    const failing = new Set(PROBES.flatMap((p) => p[2]));

    expect(SPACING_CODES.filter((c) => !failing.has(c))).toEqual([]);
    expect(PROBES.filter((p) => p[2].length === 0).length).toBeGreaterThan(0);
  });

  it("a planted disable comment silences the linter, so the suppression scan must catch it", () => {
    PLANTED.forEach((_comment, i) => {
      expect(found.get(join(dir, `silenced-${i}.ts`))).toEqual([]);
    });

    const scanDir = mkdtempSync(join(tmpdir(), "spacing-scan-"));

    try {
      mkdirSync(join(scanDir, "src"));
      spawnSync("git", ["init", "-q"], { cwd: scanDir });
      writeFileSync(
        join(scanDir, "src/planted.ts"),
        silenced(PLANTED[0] ?? ""),
      );

      const scan = spawnSync(
        "node",
        [join(REPO, "scripts/check-no-suppressions.mjs")],
        {
          cwd: scanDir,
          encoding: "utf8",
        },
      );

      expect(scan.status).toBe(1);
      expect(scan.stderr).toContain("src/planted.ts:4");
    } finally {
      rmSync(scanDir, { recursive: true, force: true });
    }
  });
});
