// The planted files the duplicate gate tests share: pairs of copies of a chosen size, written to a sandbox that holds the real configs, and
// run through one profile of one scan.
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
import { REPO, runProfile } from "../duplicates.mjs";

const scratch: string[] = [];
/** How many terms a long statement adds up, how many shared exports bound a gap, how wide the usual gap is, how many numbers the tiny function returns. */
const TERMS = 4;
const SHARED_EXPORTS = 6;
const USUAL_GAP = 13;
const TINY_LENGTH = 4;
const READABLE_LINES = 12;

/** A new empty folder in the system temp folder, removed by `cleanScratch`. */
export function sandbox(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), prefix));

  scratch.push(root);

  return root;
}

/** A file of twelve distinct lines: read by every scan, and equal to nothing a probe plants. */
const readable = () =>
  Array.from(
    { length: READABLE_LINES },
    (_, i) => `export const filler${i} = ${i} * ${i} + ${i};\n`,
  ).join("");

/** Remove every sandbox the runs made. */
export function cleanScratch() {
  for (const dir of scratch) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The two files, each with its own first and last line around the same middle, so a clone is exactly the middle. */
export function pair(middle: string, ext = "ts") {
  const wrap = (head: string, tail: string) => `${head}\n${middle}${tail}\n`;

  return {
    [`src/a.${ext}`]: wrap("const alpha = 1;", "const omega = 2;"),
    [`src/b.${ext}`]: wrap("let beta = 3;", "let psi = 4;"),
  };
}

/** Run a profile over these files in a sandbox with the real config. */
export function run(
  name: "exact" | "similar",
  files: Record<string, string>,
  scan: "production" | "tests" = "production",
) {
  const root = sandbox("duplicates-");

  for (const config of [".jscpd.json", ".jscpd.tests.json"]) {
    cpSync(join(REPO, config), join(root, config));
  }

  // The tests scan reads four folders and stops if one is missing: each gets an empty file. One more file is long enough to be read and
  // matches nothing, so a probe that expects a clone cannot pass just because no file was read.
  const folders =
    scan === "tests"
      ? {
          "tests/a.ts": "",
          "lint/a.ts": "",
          "scripts/a.mjs": "",
          "src/read-me.ts": readable(),
        }
      : {};

  for (const [file, text] of Object.entries({
    ...folders,
    ...files,
  })) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }

  return runProfile(name, root, scan).code;
}

/** Lines of one bare name each: 2 tokens a line, and `negated` of them take a minus sign (1 more token each). */
export const names = (lines: number, negated = 0) =>
  Array.from(
    { length: lines },
    (_, i) => `${i < negated ? "-" : ""}w${i};\n`,
  ).join("");

/** `lines` distinct long statements: over 40 tokens, so only the line count decides. */
export const statements = (lines: number) =>
  Array.from(
    { length: lines },
    (_, i) =>
      `t${i} = t${i}${Array.from({ length: TERMS }, (__, k) => ` + w${i + k} * s`).join("")};\n`,
  ).join("");

/** A function reading `reads` fields by index; `other` of them (from the first) read with a length check instead, and `added` puts one more statement first. */
export const reader = (
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
export const readers = (reads: number, second = {}) => ({
  "src/c.ts": `${reader("readOne", "a", reads)}\n${reader("readTwo", "b", reads, second)}`,
});

/** Top-level code in one of two files: six shared exports, a gap of `gapLines` lines that differ, six more shared exports. Each shared run is under the exact profile's 40 tokens, so only the gap kind joins them. */
export const gapped = (
  decl: "const" | "let",
  tag: string,
  gapLines = USUAL_GAP,
) => {
  const shared = (name: string, from: string) =>
    Array.from(
      { length: SHARED_EXPORTS },
      (_, i) => `export const ${name}${i + 1} = ${from}${i + 1};\n`,
    ).join("");
  const gap = Array.from(
    { length: gapLines },
    (_, i) => `${decl} mid${tag}${i + 1} = ${i + 1};\n`,
  ).join("");

  return `${decl} first${tag} = 1;\n${shared("p", "a")}${gap}${shared("q", "b")}${decl} last${tag} = 5;\n`;
};

/** A function returning an array of four numbers: over 5 lines but a tree under 20 nodes. */
export const tiny = (name: string, first: number) =>
  `function ${name}() {\n  return [\n${Array.from({ length: TINY_LENGTH }, (_, i) => `    ${first + i},\n`).join("")}  ];\n}\n`;

/** The script CI runs, in a sandbox laid out like the repo: the script, the gate module, both configs, node_modules, files that are read and match nothing, and the planted files. */
export function runCheckScript(plants: Record<string, string>) {
  const root = sandbox("duplicates-script-");

  for (const file of [
    "scripts/check-duplicates.mjs",
    "lint/gates/duplicates.mjs",
    ".jscpd.json",
    ".jscpd.tests.json",
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(REPO, file), join(root, file));
  }

  symlinkSync(join(REPO, "node_modules"), join(root, "node_modules"));
  for (const [file, text] of Object.entries({
    "src/read-me.ts": readable(),
    "tests/a.ts": "",
    "lint/a.ts": "",
    "scripts/a.mjs": "",
    ...plants,
  })) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }

  return spawnSync(
    process.execPath,
    [join(root, "scripts/check-duplicates.mjs")],
    { cwd: root, encoding: "utf8" },
  );
}
