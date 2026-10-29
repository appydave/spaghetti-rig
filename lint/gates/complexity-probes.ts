// The planted violations for the complexity gate (G06): each probe is [name, path, source, the codes it must raise]. Every limit has a
// probe that fails just over it and a twin that passes exactly on it, so a changed limit breaks a test. The sources are generated from a
// score, like the size probes are from a line count.
import type { Probe } from "./size-probes";

export const COGNITIVE = "anti-slop(cognitive-complexity)";

const CYCLOMATIC = "anti-slop(cyclomatic-complexity)";
const EXPRESSION = "sonarjs(expression-complexity)";

export const COMPLEXITY_CODES = [COGNITIVE, CYCLOMATIC, EXPRESSION];

const MAX_COGNITIVE = 8;
const MAX_CYCLOMATIC = 15;
const MAX_OPERATORS = 3;
/** Three ifs nested inside each other cost 1 + 2 + 3. */
const NEST_COST = 6;
const SUITE_TESTS = 6;

const each = (count: number, row: (i: number) => string): string =>
  Array.from({ length: count }, (_, i) => row(i)).join("\n");

/** A function whose cognitive complexity is exactly this much: three nested ifs, then one flat if for every point after that. */
export const cognitive = (score: number): string =>
  [
    "export function f(a: boolean, b: boolean, c: boolean, n: number): number {",
    "  if (a) {\n    if (b) {\n      if (c) {\n        return 1;\n      }\n    }\n  }",
    each(
      score - NEST_COST,
      (i) => `  if (n === ${i}) {\n    return ${i};\n  }`,
    ),
    "  return 0;\n}\n",
  ].join("\n");

/** A function whose cyclomatic complexity is exactly this much: one switch case for every point after the first. */
const cyclomatic = (score: number): string =>
  [
    "export function f(k: string): number {\n  switch (k) {",
    each(score - 1, (i) => `    case "k${i}":\n      return ${i};`),
    "    default:\n      return -1;\n  }\n}\n",
  ].join("\n");

/** One expression with exactly this many conditional operators, five terms for four of them. */
const expression = (operators: number): string => {
  const terms = each(operators + 1, (i) => `x${i}`).split("\n");

  return `export const g = (${terms.map((t) => `${t}: boolean`).join(", ")}): boolean => ${terms.join(" && ")};\n`;
};

/** A test file whose one describe() holds several small tests: each callback is measured on its own statements, so none of them adds up. */
const suite = (): string =>
  [
    'import { describe, it } from "vitest";\n',
    'describe("grouping", () => {',
    each(
      SUITE_TESTS,
      (i) =>
        `  it("t${i}", () => {\n    if (${i}) {\n      if (${i + 1}) {\n        throw new Error();\n      }\n    }\n  });`,
    ),
    "});\n",
  ].join("\n");

export const COMPLEXITY_PROBES: readonly Probe[] = [
  [
    `cognitive ${MAX_COGNITIVE + 1} fails`,
    "src/probe/cognitive-over.ts",
    cognitive(MAX_COGNITIVE + 1),
    [COGNITIVE],
  ],
  [
    `cognitive ${MAX_COGNITIVE} passes`,
    "src/probe/cognitive-at.ts",
    cognitive(MAX_COGNITIVE),
    [],
  ],
  [
    `cyclomatic ${MAX_CYCLOMATIC + 1} fails`,
    "src/probe/cyclomatic-over.ts",
    cyclomatic(MAX_CYCLOMATIC + 1),
    [CYCLOMATIC],
  ],
  [
    `cyclomatic ${MAX_CYCLOMATIC} passes`,
    "src/probe/cyclomatic-at.ts",
    cyclomatic(MAX_CYCLOMATIC),
    [],
  ],
  [
    `an expression of ${MAX_OPERATORS + 1} operators fails`,
    "src/probe/expression-over.ts",
    expression(MAX_OPERATORS + 1),
    [EXPRESSION],
  ],
  [
    `an expression of ${MAX_OPERATORS} operators passes`,
    "src/probe/expression-at.ts",
    expression(MAX_OPERATORS),
    [],
  ],
  [
    "a describe() of small tests passes: each test is measured on its own",
    "src/probe/suite.test.ts",
    suite(),
    [],
  ],
];
