// CSS colours live in :root as custom properties named by role; every other declaration reads them with var().
// Counts hex, colour functions and named colours in declarations outside :root. Exits 1 on any finding, and on no files at all.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isColorValue, isNamedColor } from "./color-values.mjs";

const HEX = /#[\da-f]{3,8}\b/gi;
const FUNCTION_CALL = /\b[a-z-]+\(/gi;
const WORD = /[a-z]+/gi;

/** @param {string} value */
function coloursIn(value) {
  const bare = value
    .replaceAll(/url\([^)]*\)/gi, "")
    .replaceAll(/(["']).*?\1/g, "")
    .replaceAll(/--[\w-]+/g, "");
  const calls = (bare.match(FUNCTION_CALL) ?? []).filter((c) =>
    isColorValue(c),
  );
  const words = (bare.replaceAll(FUNCTION_CALL, "").match(WORD) ?? []).filter(
    (w) => isNamedColor(w),
  );

  return [...(bare.match(HEX) ?? []), ...calls, ...words];
}

/**
 * The declaration that ends at `end` (a ";" or a "}"), if there is one outside :root: its line and its text.
 * @param {string} text @param {number} start @param {number} end @param {string | undefined} rule
 */
function declarationEndingAt(text, start, end, rule) {
  const segment = text.slice(start, end);

  if (segment.indexOf(":") <= 0 || rule === ":root") {
    return [];
  }

  const first = start + segment.length - segment.trimStart().length;

  return [{ line: text.slice(0, first).split("\n").length, segment }];
}

/** Every declaration outside :root, in order, found by walking the braces and semicolons of the text. */
function declarationsOutsideRoot(text) {
  const found = [];
  const rules = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === "{") {
      rules.push(text.slice(start, i).trim());
      start = i + 1;
    } else if (ch === ";" || ch === "}") {
      found.push(...declarationEndingAt(text, start, i, rules.at(-1)));
      if (ch === "}") {
        rules.pop();
      }

      start = i + 1;
    }
  }

  return found;
}

/** @param {string} css @returns {{ line: number, colour: string, declaration: string }[]} */
export function findCssColours(css) {
  const text = css.replaceAll(/\/\*[\s\S]*?\*\//g, (c) =>
    c.replaceAll(/[^\n]/g, " "),
  );

  return declarationsOutsideRoot(text).flatMap(({ line, segment }) =>
    coloursIn(segment.slice(segment.indexOf(":") + 1)).map((colour) => ({
      line,
      colour,
      declaration: segment.trim(),
    })),
  );
}

export function scan(dir) {
  const files = readdirSync(dir, { recursive: true })
    .filter((f) => String(f).endsWith(".css"))
    .map((f) => join(dir, String(f)));

  return files.map((file) => ({
    file,
    findings: findCssColours(readFileSync(file, "utf8")),
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root =
    process.argv[2] ?? fileURLToPath(new URL("../../src", import.meta.url));
  const results = scan(root);

  if (results.length === 0) {
    console.error("css-colours: no .css files scanned, so nothing was checked");
    process.exit(1);
  }

  let total = 0;

  for (const { file, findings } of results) {
    for (const f of findings) {
      total++;
      console.error(
        `${file}:${f.line}: ${f.colour} in "${f.declaration}". Put the colour in :root as a custom property named for its role, and use var(--name) here.`,
      );
    }
  }

  if (total > 0) {
    process.exit(1);
  }

  console.log(
    `css-colours: ${results.length} file(s), no colour outside :root`,
  );
}
