// Proves the coverage ratchet can only go down: vite.config.ts against origin/main's, and the check itself on planted caps.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { capProblems } from "./ratchet-down";

const REPO = resolve(import.meta.dirname, "../..");
const CONFIG = "vite.config.ts";
/** Comparing needs a git fetch in CI's shallow checkout; a slow one must never read as a ratchet failure. */
const COMPARE_TIMEOUT_MS = 60_000;
const NAMES = [
  "MAX_UNCOVERED_STATEMENTS",
  "MAX_UNCOVERED_BRANCHES",
  "MAX_UNCOVERED_FUNCTIONS",
];
const BACKSTOPS = [
  "BACKSTOP_STATEMENTS",
  "BACKSTOP_BRANCHES",
  "BACKSTOP_FUNCTIONS",
];
const BACKSTOP_STEP = 0.1;
const INLINE_RAISE = 50;
/** Each pinned thresholds line, and an inline form that would slip past the constants (the cap raised, or the backstop replaced by a bare number). */
const LINES: [string, string][] = [
  [
    "statements: -MAX_UNCOVERED_STATEMENTS,",
    `statements: -(MAX_UNCOVERED_STATEMENTS + ${INLINE_RAISE}),`,
  ],
  [
    "branches: -MAX_UNCOVERED_BRANCHES,",
    `branches: -(MAX_UNCOVERED_BRANCHES + ${INLINE_RAISE}),`,
  ],
  [
    "functions: -MAX_UNCOVERED_FUNCTIONS,",
    `functions: -(MAX_UNCOVERED_FUNCTIONS + ${INLINE_RAISE}),`,
  ],
  ["statements: BACKSTOP_STATEMENTS,", `statements: ${INLINE_RAISE},`],
  ["branches: BACKSTOP_BRANCHES,", `branches: ${INLINE_RAISE},`],
  ["functions: BACKSTOP_FUNCTIONS,", `functions: ${INLINE_RAISE},`],
];

/** The config as origin/main has it. CI's shallow checkout has no origin/main, so a missing ref is fetched once (depth 1) before reading. */
function baseConfig() {
  const read = () =>
    execFileSync("git", ["show", `origin/main:${CONFIG}`], {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

  try {
    return read();
  } catch {
    try {
      execFileSync(
        "git",
        [
          "fetch",
          "--no-tags",
          "--depth=1",
          "origin",
          "main:refs/remotes/origin/main",
        ],
        { cwd: REPO, stdio: "ignore" },
      );

      return read();
    } catch {
      throw new Error(
        `cannot read origin/main:${CONFIG} even after \`git fetch origin main\`: the ratchet needs a base to compare with`,
      );
    }
  }
}

const head = readFileSync(resolve(REPO, CONFIG), "utf8");

/** A good vite.config.ts in miniature, so the probes below hold whatever the real file says. */
const GOOD = `const MAX_UNCOVERED_STATEMENTS = 435;
const MAX_UNCOVERED_BRANCHES = 381;
const MAX_UNCOVERED_FUNCTIONS = 77;
const BACKSTOP_STATEMENTS = 91.6;
const BACKSTOP_BRANCHES = 82.5;
const BACKSTOP_FUNCTIONS = 87.7;
      thresholds: {
        statements: -MAX_UNCOVERED_STATEMENTS,
        branches: -MAX_UNCOVERED_BRANCHES,
        functions: -MAX_UNCOVERED_FUNCTIONS,
        "src/**/*.ts": {
          statements: BACKSTOP_STATEMENTS,
          branches: BACKSTOP_BRANCHES,
          functions: BACKSTOP_FUNCTIONS,
        },
      },
`;

/** The config with one constant moved by `delta` (to one decimal, as the backstops are written). */
function moved(source: string, name: string, delta: number) {
  return source.replace(
    new RegExp(`^const ${name} = (\\d+(?:\\.\\d+)?);$`, "m"),
    (_line, value: string) =>
      `const ${name} = ${Number((Number(value) + delta).toFixed(1))};`,
  );
}

describe("the coverage ratchet", () => {
  it(
    "is no looser than origin/main's: lower uncovered counts only, backstops no lower",
    { timeout: COMPARE_TIMEOUT_MS },
    () => {
      expect(capProblems(baseConfig(), head)).toEqual([]);
    },
  );

  describe.each(NAMES)("%s", (name) => {
    it("fails when raised by one, naming the cap and the ruling", () => {
      const problems = capProblems(GOOD, moved(GOOD, name, 1));

      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(name);
      expect(problems[0]).toContain("raising one needs a human ruling");
    });

    it("passes when lowered, and when unchanged", () => {
      expect(capProblems(GOOD, moved(GOOD, name, -1))).toEqual([]);
      expect(capProblems(GOOD, GOOD)).toEqual([]);
    });

    it("fails when it is gone", () => {
      const gone = GOOD.replace(new RegExp(`^const ${name} = \\d+;$`, "m"), "");

      expect(capProblems(GOOD, gone)).toEqual([
        `${name} is missing from vite.config.ts`,
      ]);
    });
  });

  describe.each(BACKSTOPS)("%s", (name) => {
    it("fails when lowered, naming the backstop and the ruling", () => {
      const problems = capProblems(GOOD, moved(GOOD, name, -BACKSTOP_STEP));

      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(name);
      expect(problems[0]).toContain("lowering one needs a human ruling");
    });

    it("passes when raised, and when unchanged", () => {
      expect(capProblems(GOOD, moved(GOOD, name, BACKSTOP_STEP))).toEqual([]);
      expect(capProblems(GOOD, GOOD)).toEqual([]);
    });

    it("fails when it is gone", () => {
      const gone = GOOD.replace(
        new RegExp(`^const ${name} = [\\d.]+;$`, "m"),
        "",
      );

      expect(capProblems(GOOD, gone)).toEqual([
        `${name} is missing from vite.config.ts`,
      ]);
    });
  });

  describe.each(LINES)("the thresholds line %s", (line, inline) => {
    it("fails when written another way, naming the line", () => {
      const problems = capProblems(GOOD, GOOD.replace(line, inline));

      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(line);
      expect(problems[0]).toContain("never an inline number");
    });
  });

  it("fails on a duplicate threshold key that would override a pinned line", () => {
    const sneaky = GOOD.replace(
      "functions: BACKSTOP_FUNCTIONS,",
      "functions: BACKSTOP_FUNCTIONS,\n          statements: 1,",
    );

    expect(capProblems(GOOD, sneaky)).toEqual([
      expect.stringContaining("no extra or duplicate threshold"),
    ]);
  });
});
