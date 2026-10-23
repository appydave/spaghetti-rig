// Proves the readable-spacing gate (Omer 6b8b7f3 + 3c484f4) is wired: every rule, and every padding-line entry, fails a planted
// violation and passes its fixed twin. Probes run through the repo's real .oxlintrc.json, so changing the config breaks a test.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = resolve(import.meta.dirname, "../..");
const OXLINT = join(REPO, "node_modules/.bin/oxlint");

const CURLY = "eslint(curly)";
const SEQUENCES = "eslint(no-sequences)";
const ONE_VAR = "eslint(one-var)";
const STATEMENTS = "stylistic(max-statements-per-line)";
const BRACES = "stylistic(brace-style)";
const MEMBERS = "stylistic(lines-between-class-members)";
const PADDING = "stylistic(padding-line-between-statements)";
const SPACING_CODES: readonly string[] = [
  CURLY,
  SEQUENCES,
  ONE_VAR,
  STATEMENTS,
  BRACES,
  MEMBERS,
  PADDING,
];

/** A probe: its name, the file it plants and the spacing findings oxlint must report for it (none for an allowed shape). */
type Probe = readonly [string, string, readonly string[]];

const file = (...rows: string[]): string => `${rows.join("\n")}\n`;
const inFunction = (...rows: string[]): string =>
  file("export function f(a: number): number {", ...rows, "}");

const RULE_PROBES: readonly Probe[] = [
  [
    "curly: an unbraced if",
    inFunction("  let n = a;", "", "  if (n) n += 1;", "", "  return n;"),
    [CURLY],
  ],
  [
    "curly: braced if is clean",
    inFunction(
      "  let n = a;",
      "",
      "  if (n) {",
      "    n += 1;",
      "  }",
      "",
      "  return n;",
    ),
    [],
  ],
  [
    "no-sequences: a comma expression",
    inFunction("  let n = a;", "", "  n += 1, n += 2;", "", "  return n;"),
    [SEQUENCES],
  ],
  [
    "one-var: two declarations in one statement",
    file(
      "export function f(): number {",
      "  const a = 1, b = 2;",
      "",
      "  return a + b;",
      "}",
    ),
    [ONE_VAR],
  ],
  [
    "max-statements-per-line: two statements on a line",
    inFunction("  let n = a;", "", "  n += 1; n += 2;", "", "  return n;"),
    [STATEMENTS],
  ],
  [
    "brace-style: else on its own line (1tbs)",
    inFunction(
      "  let n = a;",
      "",
      "  if (n) {",
      "    n += 1;",
      "  }",
      "  else {",
      "    n += 2;",
      "  }",
      "",
      "  return n;",
    ),
    [BRACES],
  ],
  [
    "brace-style: a single-line block is not allowed",
    inFunction(
      "  let n = a;",
      "",
      "  while (n < 3) { n += 1; }",
      "",
      "  return n;",
    ),
    [BRACES, BRACES, STATEMENTS],
  ],
  [
    "lines-between-class-members: methods run together",
    file(
      "export class A {",
      "  one(): number {",
      "    return 1;",
      "  }",
      "  two(): number {",
      "    return 2;",
      "  }",
      "}",
    ),
    [MEMBERS],
  ],
  [
    "lines-between-class-members: a blank line is clean",
    file(
      "export class A {",
      "  one(): number {",
      "    return 1;",
      "  }",
      "",
      "  two(): number {",
      "    return 2;",
      "  }",
      "}",
    ),
    [],
  ],
];

// One probe per entry of padding-line-between-statements, in the order of the config; "any" entries are allowed shapes.
const PADDING_PROBES: readonly Probe[] = [
  [
    "padding 1: import then a statement",
    file('import { g } from "./g";', "g();"),
    [PADDING],
  ],
  ["padding 1 fixed", file('import { g } from "./g";', "", "g();"), []],
  [
    "padding 2: import then import, no blank (any)",
    file('import { g } from "./g";', 'import { h } from "./h";', "", "g(h);"),
    [],
  ],
  [
    "padding 2: import then import, blank (any)",
    file(
      'import { g } from "./g";',
      "",
      'import { h } from "./h";',
      "",
      "g(h);",
    ),
    [],
  ],
  [
    "padding 3: a statement then return",
    inFunction("  g(a);", "  return a;"),
    [PADDING],
  ],
  ["padding 3 fixed", inFunction("  g(a);", "", "  return a;"), []],
  [
    "padding 4: a statement then a function",
    file("g();", "function h(): void {", "  g();", "}"),
    [PADDING],
  ],
  [
    "padding 4: a statement then a class",
    file("g();", "class A {", "  b = 1;", "}"),
    [PADDING],
  ],
  [
    "padding 4 fixed",
    file("g();", "", "function h(): void {", "  g();", "}"),
    [],
  ],
  [
    "padding 5: a function then a statement",
    file("function h(): void {", "  g();", "}", "h();"),
    [PADDING],
  ],
  [
    "padding 5: a class then a statement",
    file("class A {", "  b = 1;", "}", "g(A);"),
    [PADDING],
  ],
  [
    "padding 5 fixed",
    file("function h(): void {", "  g();", "}", "", "h();"),
    [],
  ],
  [
    "padding 6: a declaration then a statement",
    file("const a = 1;", "g(a);"),
    [PADDING],
  ],
  ["padding 6 fixed", file("const a = 1;", "", "g(a);"), []],
  [
    "padding 7: a statement then a declaration",
    file("g();", "const a = 1;", "", "g(a);"),
    [PADDING],
  ],
  ["padding 7 fixed", file("g();", "", "const a = 1;", "", "g(a);"), []],
  [
    "padding 8: declaration then declaration (any)",
    file("const a = 1;", "let b = 2;", "var c = 3;", "", "g(a, b, c);"),
    [],
  ],
  [
    "padding 9: a block then a statement",
    inFunction("  if (a) {", "    g();", "  }", "  g();", "", "  return a;"),
    [PADDING],
  ],
  [
    "padding 9 fixed",
    inFunction(
      "  if (a) {",
      "    g();",
      "  }",
      "",
      "  g();",
      "",
      "  return a;",
    ),
    [],
  ],
];

const PROBES: readonly Probe[] = [...RULE_PROBES, ...PADDING_PROBES];

// Built from pieces so this test file does not trip the suppression scan it exercises.
const PLANTED = [
  `${"eslint"}-${"disable"}-next-line curly`,
  `${"oxlint"}-${"disable"}-next-line curly`,
];
const silenced = (comment: string): string =>
  inFunction(
    "  let n = a;",
    "",
    `  // ${comment}`,
    "  if (n) n += 1;",
    "",
    "  return n;",
  );

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
