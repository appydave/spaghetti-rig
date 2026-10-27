// Proves the coverage ratchet can only go down: vite.config.ts against origin/main's, and the check itself on planted caps.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { capProblems } from "./ratchet-down";

const REPO = resolve(import.meta.dirname, "../..");
const CONFIG = "vite.config.ts";
const NAMES = [
  "MAX_UNCOVERED_STATEMENTS",
  "MAX_UNCOVERED_BRANCHES",
  "MAX_UNCOVERED_FUNCTIONS",
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

/** The config with one cap moved by `delta`. */
function moved(source: string, name: string, delta: number) {
  return source.replace(
    new RegExp(`^const ${name} = (\\d+);$`, "m"),
    (_line, value: string) => `const ${name} = ${Number(value) + delta};`,
  );
}

describe("the coverage ratchet", () => {
  it("is no higher than origin/main's: lower uncovered counts only", () => {
    expect(capProblems(baseConfig(), head)).toEqual([]);
  });

  describe.each(NAMES)("%s", (name) => {
    it("fails when raised by one, naming the cap and the ruling", () => {
      const problems = capProblems(head, moved(head, name, 1));

      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(name);
      expect(problems[0]).toContain("raising one needs a human ruling");
    });

    it("passes when lowered, and when unchanged", () => {
      expect(capProblems(head, moved(head, name, -1))).toEqual([]);
      expect(capProblems(head, head)).toEqual([]);
    });

    it("fails when it is gone", () => {
      const gone = head.replace(new RegExp(`^const ${name} = \\d+;$`, "m"), "");

      expect(capProblems(head, gone)).toEqual([
        `${name} is missing from vite.config.ts`,
      ]);
    });
  });
});
