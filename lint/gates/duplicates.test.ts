// Proves the duplicate gate (G08) is wired and kept honest. The probes plant a pair of copies in a sandbox that holds the real .jscpd.json:
// the exact profile fails a run of 40 tokens and passes 39, and wants a copy of more than 5 lines; the near-miss profile fails a copy that
// only has other names and passes one with a changed statement; css is read; test files are not. The guards keep the one way out honest:
// the ignore list is exactly the procedural-data file named in exemptions.ts, and that file still has the clone that earns it.
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DUPLICATES_PD } from "./exemptions";
import { PROFILES, REPO, runProfile } from "./duplicates.mjs";
import config from "../../.jscpd.json";

const scratch: string[] = [];

/** The two files, each with its own first and last line around the same middle, so a clone is exactly the middle. */
function pair(middle: string, ext = "ts") {
  const wrap = (head: string, tail: string) => `${head}\n${middle}${tail}\n`;

  return {
    [`src/a.${ext}`]: wrap("const alpha = 1;", "const omega = 2;"),
    [`src/b.${ext}`]: wrap("let beta = 3;", "let psi = 4;"),
  };
}

/** Run a profile over these files in a sandbox with the real config. */
function run(name: "exact" | "similar", files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "duplicates-"));

  scratch.push(root);
  cpSync(join(REPO, ".jscpd.json"), join(root, ".jscpd.json"));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }

  return runProfile(name, root).code;
}

/** Lines of one bare name each: 2 tokens a line, and `negated` of them take a minus sign (1 more token each). */
const names = (lines: number, negated = 0) =>
  Array.from(
    { length: lines },
    (_, i) => `${i < negated ? "-" : ""}w${i};\n`,
  ).join("");

/** `lines` distinct long statements: over 40 tokens, so only the line count decides. */
const statements = (lines: number) =>
  Array.from(
    { length: lines },
    (_, i) =>
      `t${i} = t${i} + w${i} * s + w${i + 1} * s + w${i + 2} * s + w${i + 3} * s;\n`,
  ).join("");

/** A function reading `reads` fields by index; `other` of them (from the first) read with a length check instead, and `added` puts one more statement first. */
const reader = (
  name: string,
  pre: string,
  reads: number,
  { other = 0, added = false } = {},
) => {
  const vars = Array.from({ length: reads }, (_, i) => `${pre}${i}`);
  const lines = vars.map((v, i) =>
    i < other
      ? `  const ${v} = fields.length > ${i} ? fields[${i}] : undefined;\n`
      : `  const ${v} = fields[${i}];\n`,
  );
  const missing = vars.map((v) => `${v} === undefined`).join(" || ");
  const first = added ? "  const total = 0;\n" : "";

  return `function ${name}(fields: number[]) {\n${first}${lines.join("")}\n  return ${missing}\n    ? null\n    : { ${vars.join(", ")} };\n}\n`;
};

/** Two readers of the same fields in one file; the second differs as the options say. */
const readers = (reads: number, second = {}) => ({
  "src/c.ts": `${reader("readOne", "a", reads)}\n${reader("readTwo", "b", reads, second)}`,
});

afterAll(() => {
  for (const dir of scratch) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("the exact profile", () => {
  it("fails a copy of 40 tokens", () => {
    expect(run("exact", pair(names(19, 1)))).toBe(1);
  });

  it("passes a copy of 39 tokens", () => {
    expect(run("exact", pair(names(19)))).toBe(0);
  });

  it("fails a copy of more than 5 lines", () => {
    expect(run("exact", pair(statements(4)))).toBe(1);
  });

  it("passes a copy of 5 lines", () => {
    expect(run("exact", pair(statements(3)))).toBe(0);
  });

  it("reads css", () => {
    const rule = (sel: string) =>
      `${sel} {\n${[...Array(8).keys()].map((i) => `  margin-top: ${i}rem;\n`).join("")}}\n`;
    const css = `${rule(".one")}${rule(".two")}`.replaceAll(
      "margin-top",
      "padding",
    );

    expect(
      run("exact", { "src/x.css": css, "src/other.ts": statements(8) }),
    ).toBe(1);
  });

  it("does not read test files", () => {
    const files = Object.fromEntries(
      Object.entries(pair(names(30))).map(([k, v]) => [
        k.replace(".ts", ".test.ts"),
        v,
      ]),
    );

    // One file that is read and has no copy in it, so a run that read nothing cannot pass for a run that found nothing.
    const other = { "src/other.ts": statements(8) };

    expect(run("exact", { ...files, ...other })).toBe(0);
  });
});

describe("the near-miss profile", () => {
  it("fails a copy that only has other names", () => {
    expect(run("similar", readers(4))).toBe(1);
  });

  it("fails a copy with one statement added to thirty (a tree 0.92 alike)", () => {
    expect(run("similar", readers(30, { added: true }))).toBe(1);
  });

  it("passes a copy with one statement of four changed", () => {
    expect(run("similar", readers(4, { other: 1 }))).toBe(0);
  });
});

describe("the ignore list", () => {
  it("is the procedural-data file named in exemptions.ts, and test files", () => {
    expect([...config.ignore].sort()).toEqual(
      ["**/*.test.ts", ...DUPLICATES_PD].sort(),
    );
  });

  it("still has the clone that earns it: scanned alone, without the entry, characters.ts fails", () => {
    const root = mkdtempSync(join(tmpdir(), "duplicates-pd-"));

    scratch.push(root);
    writeFileSync(
      join(root, ".jscpd.json"),
      JSON.stringify({ ...config, ignore: ["**/*.test.ts"] }),
    );
    for (const file of DUPLICATES_PD) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      cpSync(join(REPO, file), join(root, file));
    }

    expect(runProfile("exact", root).code).toBe(1);
  });

  it("reads both profiles from one place", () => {
    expect(Object.keys(PROFILES)).toEqual(["exact", "similar"]);
  });
});
