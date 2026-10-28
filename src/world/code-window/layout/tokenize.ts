import type { RowKind, View } from "#root/src/content/types.ts";
import type { Token } from "#root/src/world/code-window/layout/types.ts";
import { LINE, SYNTAX } from "#root/src/world/palette.ts";

const KEYWORDS = new Set(
  "const let var function return if else for while do switch case break continue new class extends implements interface type enum import export from as async await throw try catch finally typeof instanceof in of void null undefined true false this super default public private readonly static yield delete keyof satisfies".split(
    " ",
  ),
);

/** Tiny tokenizer: enough to colour TypeScript, JSON, YAML and shell like an editor would. */
export function tokenize(src: string, view: View, diff: RowKind): Token[] {
  if (diff === "l") {
    return [{ text: src, color: LINE.labelLine }];
  }

  if (view === "output") {
    // Tool output: numbers stand out, the rest is plain.
    return splitBy(
      src,
      /(\d[\d,.]*%?|✓|✗|→|FAIL|PASS|error|warning)/g,
      outputColor,
      diff === "d" ? LINE.outputRemoved : SYNTAX.text,
    );
  }

  return tokenizeCode(src);
}

/** The colour of a tool-output word that is not a number. */
const OUTPUT_WORD_COLOURS = new Map([
  ["✓", LINE.outputOk],
  ["PASS", LINE.outputOk],
  ["→", SYNTAX.punct],
]);

function outputColor(m: string): string {
  return /^\d/.test(m)
    ? SYNTAX.number
    : (OUTPUT_WORD_COLOURS.get(m) ?? LINE.outputFail);
}

function tokenizeCode(src: string): Token[] {
  const out: Token[] = [];
  const re =
    /(\/\/.*$|\/\*.*?\*\/|#\s.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)|([{}()[\];,.:<>=!&|?+\-*/%^~@]+)|(\s+)|(.)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src))) {
    out.push({ text: m[0], color: codeColor(m, src[re.lastIndex]) });
  }

  return merge(out);
}

/** The colour of one match of the code pattern; `next` is the character after it. */
function codeColor(m: RegExpExecArray, next: string | undefined): string {
  const [, comment, str, num, word, punct] = m;

  if (comment) {
    return SYNTAX.comment;
  }

  if (str) {
    return SYNTAX.string;
  }

  if (num) {
    return SYNTAX.number;
  }

  if (word) {
    return wordColor(word, next);
  }

  return punct ? SYNTAX.punct : SYNTAX.text;
}

function wordColor(word: string, next: string | undefined): string {
  if (KEYWORDS.has(word)) {
    return SYNTAX.keyword;
  }

  if (/^[A-Z]/.test(word)) {
    return SYNTAX.type;
  }

  return next === "(" ? SYNTAX.fn : SYNTAX.text;
}

function splitBy(
  src: string,
  re: RegExp,
  colorOf: (m: string) => string,
  base: string,
): Token[] {
  const out: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src))) {
    if (m.index > last) {
      out.push({ text: src.slice(last, m.index), color: base });
    }

    out.push({ text: m[0], color: colorOf(m[0]) });
    last = m.index + m[0].length;
  }

  if (last < src.length) {
    out.push({ text: src.slice(last), color: base });
  }

  return out;
}

function merge(tokens: Token[]): Token[] {
  const out: Token[] = [];

  for (const t of tokens) {
    const prev = out.at(-1);

    if (prev && prev.color === t.color) {
      prev.text += t.text;
    } else {
      out.push({ ...t });
    }
  }

  return out;
}

/** Slice tokens to a character range. */
export function sliceTokens(
  tokens: Token[],
  from: number,
  to: number,
): Token[] {
  const out: Token[] = [];
  let at = 0;

  for (const t of tokens) {
    const s = Math.max(from, at);
    const e = Math.min(to, at + t.text.length);

    if (e > s) {
      out.push({ text: t.text.slice(s - at, e - at), color: t.color });
    }

    at += t.text.length;
  }

  return out;
}
