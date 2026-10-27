// Proves the duplicate gate (G08) is wired and kept honest. The probes plant a pair of copies in a sandbox that holds the real .jscpd.json:
// the exact profile fails a run of 40 tokens and passes 39, and wants a copy of more than 5 lines; the near-miss profile fails a copy that
// only has other names and passes one with a changed statement; css is read; test files are not. The guards keep the one way out honest:
// the ignore list is exactly the procedural-data file named in exemptions.ts, and that file still has the clone that earns it.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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

/** Top-level code in one of two files: six shared exports, a gap of thirteen lines that differ, six more shared exports. Each shared run is under the exact profile's 40 tokens, so only the gap kind joins them. */
const gapped = (decl: "const" | "let", tag: string) => {
  const shared = (name: string, from: string) =>
    Array.from(
      { length: 6 },
      (_, i) => `export const ${name}${i + 1} = ${from}${i + 1};\n`,
    ).join("");
  const gap = Array.from(
    { length: 13 },
    (_, i) => `${decl} mid${tag}${i + 1} = ${i + 1};\n`,
  ).join("");

  return `${decl} first${tag} = 1;\n${shared("p", "a")}${gap}${shared("q", "b")}${decl} last${tag} = 5;\n`;
};

/** A function returning an array of four numbers: over 5 lines but a tree under 20 nodes. */
const tiny = (name: string, first: number) =>
  `function ${name}() {\n  return [\n${[0, 1, 2, 3].map((i) => `    ${first + i},\n`).join("")}  ];\n}\n`;

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

describe("the near-miss profile, in the shapes only its own flags catch", () => {
  const gappedFiles = {
    "src/a.ts": gapped("const", "A"),
    "src/b.ts": gapped("let", "B"),
  };

  it("fails two short runs joined across a gap of changed lines (--max-gap-lines)", () => {
    expect(run("similar", gappedFiles)).toBe(1);
  });

  it("does not fail those same runs under the exact profile", () => {
    expect(run("exact", gappedFiles)).toBe(0);
  });

  it("fails a pair of functions under 20 tree nodes (min-nodes 1)", () => {
    expect(
      run("similar", { "src/c.ts": `${tiny("one", 1)}\n${tiny("two", 5)}` }),
    ).toBe(1);
  });
});

describe("the script CI runs", () => {
  /** A sandbox laid out like the repo for the script: the script, the gate module, the config, node_modules, and these files in src/. */
  function runScript(files: Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), "duplicates-script-"));

    scratch.push(root);
    for (const file of [
      "scripts/check-duplicates.mjs",
      "lint/gates/duplicates.mjs",
      ".jscpd.json",
    ]) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      cpSync(join(REPO, file), join(root, file));
    }

    symlinkSync(join(REPO, "node_modules"), join(root, "node_modules"));
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }

    return spawnSync(
      process.execPath,
      [join(root, "scripts/check-duplicates.mjs")],
      { cwd: root, encoding: "utf8" },
    );
  }

  it("exits 1 and says what to do when there is a clone", () => {
    const run1 = runScript(pair(names(19, 1)));

    expect(run1.status).toBe(1);
    expect(run1.stderr).toContain("Move the repeated code");
  });

  it("exits 0 when there is none", () => {
    expect(runScript({ "src/other.ts": statements(8) }).status).toBe(0);
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
