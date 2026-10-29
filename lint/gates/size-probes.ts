// The planted violations for the size gate (G04): each probe is [name, path, source, the codes it must raise]. Every limit has a probe
// that fails just over it and a twin that passes exactly on it, so a changed limit breaks a test.
const LINES = "eslint(max-lines)";
const FUNCTION = "eslint(max-lines-per-function)";

export const PARAMS = "eslint(max-params)";

const MEMBERS = "size(max-members)";
const SIGNATURE = "size(max-signature-params)";
const TEST_FUNCTION = "size(max-test-function-lines)";

export const SIZE_CODES = [
  LINES,
  FUNCTION,
  PARAMS,
  MEMBERS,
  SIGNATURE,
  TEST_FUNCTION,
];

const MAX_FILE = 300;
const MAX_FUNCTION = 60;
const MAX_PARAMS = 4;
const MAX_MEMBERS = 30;
/** Lines the opening call and the closing brace of a one-line-header callback take. */
const WRAP = 2;
const DESCRIBE_FILLER = 120;

export type Probe = readonly [
  name: string,
  path: string,
  source: string,
  codes: readonly string[],
];

/** This many filler lines, alternately a comment and a blank line: a limit that skips comments, or one that skips blank lines, would stop counting them. */
const filler = (count: number): string =>
  Array.from({ length: count }, (_, i) => (i % 2 ? "" : "  // filler")).join(
    "\n",
  );

/** A source file of exactly this many lines. */
export const file = (lines: number): string =>
  `export const a = 1;\n${filler(lines - 1)}\n`;

/** A function whose braces, and so whose lines, span exactly this many lines (the filler is comments and blank lines: they count). */
const fn = (lines: number, head = "export function f() {"): string =>
  `${head}\n${filler(lines - 2)}\n}\n`;

const members = (count: number, each: (i: number) => string): string =>
  Array.from({ length: count }, (_, i) => each(i)).join("\n");

const params = (count: number): string =>
  Array.from({ length: count }, (_, i) => `p${i}: number`).join(", ");

export const SIZE_PROBES: readonly Probe[] = [
  [
    "a 301-line file fails",
    "src/probe/over-file.ts",
    file(MAX_FILE + 1),
    [LINES],
  ],
  ["a 300-line file passes", "src/probe/at-file.ts", file(MAX_FILE), []],
  [
    "a 61-line function fails (blank lines and comments count)",
    "src/probe/over-fn.ts",
    fn(MAX_FUNCTION + 1),
    [FUNCTION],
  ],
  ["a 60-line function passes", "src/probe/at-fn.ts", fn(MAX_FUNCTION), []],
  [
    "a 61-line IIFE fails",
    "src/probe/over-iife.ts",
    fn(MAX_FUNCTION + 1, "export const x = (() => {").replace(
      /}\n$/,
      "})();\n",
    ),
    [FUNCTION],
  ],
  [
    "a function with 5 parameters fails",
    "src/probe/over-params.ts",
    `export function f(${params(MAX_PARAMS + 1)}) {}\n`,
    [PARAMS],
  ],
  [
    "a function with 4 parameters passes",
    "src/probe/at-params.ts",
    `export function f(${params(MAX_PARAMS)}) {}\n`,
    [],
  ],
  [
    "a class with 31 members fails",
    "src/probe/over-class.ts",
    `export class C {\n${members(MAX_MEMBERS + 1, (i) => `  m${i} = 1;`)}\n}\n`,
    [MEMBERS],
  ],
  [
    "a class with 30 members passes",
    "src/probe/at-class.ts",
    `export class C {\n${members(MAX_MEMBERS, (i) => `  m${i} = 1;`)}\n}\n`,
    [],
  ],
  [
    "an interface with 31 members fails",
    "src/probe/over-interface.ts",
    `export interface I {\n${members(MAX_MEMBERS + 1, (i) => `  m${i}: number;`)}\n}\n`,
    [MEMBERS],
  ],
  [
    "an interface with 30 members passes",
    "src/probe/at-interface.ts",
    `export interface I {\n${members(MAX_MEMBERS, (i) => `  m${i}: number;`)}\n}\n`,
    [],
  ],
  [
    "an object type with 31 members fails",
    "src/probe/over-type.ts",
    `export type T = {\n${members(MAX_MEMBERS + 1, (i) => `  m${i}: number;`)}\n};\n`,
    [MEMBERS],
  ],
  [
    "an object type with 30 members passes",
    "src/probe/at-type.ts",
    `export type T = {\n${members(MAX_MEMBERS, (i) => `  m${i}: number;`)}\n};\n`,
    [],
  ],
  [
    "a TypeScript method signature with 5 parameters fails",
    "src/probe/over-signature.ts",
    `export interface I {\n  m(${params(MAX_PARAMS + 1)}): void;\n}\n`,
    [SIGNATURE],
  ],
  [
    "a TypeScript method signature with 4 parameters passes",
    "src/probe/at-signature.ts",
    `export interface I {\n  m(${params(MAX_PARAMS)}): void;\n}\n`,
    [],
  ],
  [
    "a TypeScript call signature with 5 parameters fails",
    "src/probe/over-call.ts",
    `export interface I {\n  (${params(MAX_PARAMS + 1)}): void;\n}\n`,
    [SIGNATURE],
  ],
  [
    "in a test file a 61-line it() callback fails (the test rule, not the native one)",
    "src/probe/over-it.test.ts",
    `import { it } from "vitest";\n\nit("x", () => {\n${filler(MAX_FUNCTION + 1 - WRAP)}\n});\n`,
    [TEST_FUNCTION],
  ],
  [
    "in a test file a 60-line it() callback passes",
    "src/probe/at-it.test.ts",
    `import { it } from "vitest";\n\nit("x", () => {\n${filler(MAX_FUNCTION - WRAP)}\n});\n`,
    [],
  ],
  [
    "in a test file a describe() callback of any length passes",
    "src/probe/describe.test.ts",
    `import { describe } from "vitest";\n\ndescribe("x", () => {\n${filler(DESCRIBE_FILLER)}\n});\n`,
    [],
  ],
  [
    "in a test file a 61-line helper function fails",
    "src/probe/helper.test.ts",
    fn(MAX_FUNCTION + 1),
    [TEST_FUNCTION],
  ],
];
