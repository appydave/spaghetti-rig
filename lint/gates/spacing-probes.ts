// The planted violations for the readable-spacing gate test (spacing.test.ts): one probe per rule and per padding-line entry.
const CURLY = "eslint(curly)";
const SEQUENCES = "eslint(no-sequences)";
const ONE_VAR = "eslint(one-var)";
const STATEMENTS = "stylistic(max-statements-per-line)";
const BRACES = "stylistic(brace-style)";
const MEMBERS = "stylistic(lines-between-class-members)";
const PADDING = "stylistic(padding-line-between-statements)";

export const SPACING_CODES: readonly string[] = [
  CURLY,
  SEQUENCES,
  ONE_VAR,
  STATEMENTS,
  BRACES,
  MEMBERS,
  PADDING,
];

/** A probe: its name, the file it plants and the spacing findings oxlint must report for it (none for an allowed shape). */
export type Probe = readonly [string, string, readonly string[]];

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

export const PROBES: readonly Probe[] = [...RULE_PROBES, ...PADDING_PROBES];

// Built from pieces so this test file does not trip the suppression scan it exercises.
export const PLANTED = [
  `${"eslint"}-${"disable"}-next-line curly`,
  `${"oxlint"}-${"disable"}-next-line curly`,
];
export const silenced = (comment: string): string =>
  inFunction(
    "  let n = a;",
    "",
    `  // ${comment}`,
    "  if (n) n += 1;",
    "",
    "  return n;",
  );
