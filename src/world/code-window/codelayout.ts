import type {
  AnnotationKind,
  Card,
  RowKind,
  View,
} from "#root/src/content/types.ts";
import { present } from "#root/src/nth.ts";
import { LINE, SYNTAX } from "#root/src/world/palette.ts";

export { SYNTAX } from "#root/src/world/palette.ts";

/** A break in a long line is searched for backwards only as far as this share of the wrap width. */
const WRAP_SEARCH_SHARE = 0.5;
/** Code is never wrapped narrower than this many columns, and a wrapped line indents at most this many. */
const MIN_CODE_COLUMNS = 12;
const MAX_WRAP_INDENT = 8;
/** Captions are prose in a proportional font: this many times as many characters fit on a line as code. */
const CAPTION_COLUMNS_FACTOR = 1.35;
/** A file name made from a card title is cut to this many characters (before the extension). */
const MAX_FILE_STEM = 28;
/** The narrowest wrap width longestRow reports. */
const MIN_ROW_WIDTH = 10;

export interface Token {
  text: string;
  color: string;
}
export interface Mark {
  from: number;
  to: number;
  kind: AnnotationKind;
  pin: number;
  whole: boolean;
}
export interface Line {
  type: "code" | "caption" | "gap" | "rule";
  view: View;
  diff: RowKind;
  text: string;
  tokens: Token[];
  marks: Mark[];
  /** Wrapped continuation of the row above. */
  cont: boolean;
  /** Index of the source block and row (for effects that point at a line). */
  block: number;
  row: number;
}
export interface Layout {
  lines: Line[];
  notes: { pin: number; kind: AnnotationKind; note: string }[];
  cols: number;
  filename: string;
}

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
      (m) =>
        /^\d/.test(m)
          ? SYNTAX.number
          : m === "✓" || m === "PASS"
            ? LINE.outputOk
            : m === "→"
              ? SYNTAX.punct
              : LINE.outputFail,
      diff === "d" ? LINE.outputRemoved : SYNTAX.text,
    );
  }

  const out: Token[] = [];
  const re =
    /(\/\/.*$|\/\*.*?\*\/|#\s.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)|([{}()[\];,.:<>=!&|?+\-*/%^~@]+)|(\s+)|(.)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src))) {
    const [all, comment, str, num, word, punct] = m;
    let color = SYNTAX.text;

    if (comment) {
      color = SYNTAX.comment;
    } else if (str) {
      color = SYNTAX.string;
    } else if (num) {
      color = SYNTAX.number;
    } else if (word) {
      if (KEYWORDS.has(word)) {
        color = SYNTAX.keyword;
      } else if (/^[A-Z]/.test(word)) {
        color = SYNTAX.type;
      } else if (src[re.lastIndex] === "(") {
        color = SYNTAX.fn;
      }
    } else if (punct) {
      color = SYNTAX.punct;
    }

    out.push({ text: all, color });
  }

  return merge(out);
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
function sliceTokens(tokens: Token[], from: number, to: number): Token[] {
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

/** Break a row into chunks of at most `cols`, preferring to break after spaces or punctuation. */
export function wrapPoints(
  text: string,
  cols: number,
  indent: number,
): number[] {
  const cuts = [0];
  let start = 0;

  while (text.length - start > (start ? cols - indent : cols)) {
    const width = start ? cols - indent : cols;
    let cut = start + width;

    for (let i = start + width; i > start + width * WRAP_SEARCH_SHARE; i--) {
      if (/[\s,;({[=>]/.test(text.charAt(i - 1))) {
        cut = i;
        break;
      }
    }

    cuts.push(cut);
    start = cut;
  }

  return cuts;
}

/** Lay a card's blocks out as editor lines, wrapped to `cols`, with annotation marks and numbered pins. */
export function layoutCard(
  card: Card,
  cols: number,
  fallbackName: string,
): Layout {
  const lines: Line[] = [];
  const pinOf = new Map<object, number>();

  for (const [i, a] of card.annotations.entries()) {
    pinOf.set(a, i + 1);
  }

  let filename = "";
  const stepFor = (b: number) =>
    (card.steps ?? []).filter((s) => s.block === b).map((s) => s.text);

  for (const s of card.steps ?? []) {
    if (s.block === null) {
      pushCaption(lines, s.text, cols);
    }
  }

  for (const [bi, block] of card.blocks.entries()) {
    if (bi > 0) {
      lines.push(blankLine("rule", block.view, bi));
    }

    for (const text of stepFor(bi)) {
      pushCaption(lines, text, cols, bi);
    }

    for (const [ri, [kind, text]] of block.rows.entries()) {
      const pinned = card.annotations.some(
        (a) => a.block === bi && a.row === ri,
      );

      if (
        kind === "l" &&
        !filename &&
        bi === 0 &&
        block.view !== "output" &&
        !pinned
      ) {
        filename = text;
        continue;
      }

      const tokens = tokenize(text, block.view, kind);
      const marks: Mark[] = card.annotations
        .filter((a) => a.block === bi && a.row === ri)
        .map((a) => {
          const idx = a.match ? text.indexOf(a.match) : -1;
          const whole = idx < 0;

          return {
            from: whole ? 0 : idx,
            to: whole ? Math.max(1, text.length) : idx + a.match.length,
            kind: a.kind,
            pin: present(pinOf.get(a), "the annotation pin"),
            whole,
          };
        });
      const prefix = block.view === "diff" && kind !== "l" ? 2 : 0;
      const usable = Math.max(MIN_CODE_COLUMNS, cols - prefix);
      const indent = Math.min(
        MAX_WRAP_INDENT,
        (text.match(/^\s*/)?.[0].length ?? 0) + 2,
      );
      const cuts = wrapPoints(text, usable, indent);

      for (const [ci, from] of cuts.entries()) {
        const to = cuts[ci + 1] ?? text.length;
        const lineMarks = marks.flatMap((m): Mark[] => {
          const s = Math.max(m.from, from);
          const e = Math.min(m.to, to);

          if (e <= s && !(m.whole && ci === 0 && text.length === 0)) {
            return [];
          }

          return [
            {
              ...m,
              from: s - from,
              to: Math.max(s - from + 1, e - from),
              pin: ci === cuts.length - 1 || m.to <= to ? m.pin : 0,
            },
          ];
        });

        lines.push({
          type: "code",
          view: block.view,
          diff: kind,
          text: text.slice(from, to),
          tokens: sliceTokens(tokens, from, to),
          marks: lineMarks,
          cont: ci > 0,
          block: bi,
          row: ri,
        });
      }
    }
  }

  const notes = card.annotations.map((a, i) => ({
    pin: i + 1,
    kind: a.kind,
    note: a.note,
  }));

  return { lines, notes, cols, filename: filename || fallbackName };
}

function blankLine(type: Line["type"], view: View, block: number): Line {
  return {
    type,
    view,
    diff: "c",
    text: "",
    tokens: [],
    marks: [],
    cont: false,
    block,
    row: -1,
  };
}

function pushCaption(lines: Line[], text: string, cols: number, block = -1) {
  // Captions are prose in a proportional font, roughly 1.35× as many characters fit per line.
  const width = Math.floor(cols * CAPTION_COLUMNS_FACTOR);
  const words = text.split(/\s+/);
  let cur = "";

  for (const w of words) {
    if (`${cur} ${w}`.trim().length > width && cur) {
      lines.push({ ...blankLine("caption", "code", block), text: cur });
      cur = w;
    } else {
      cur = `${cur} ${w}`.trim();
    }
  }

  if (cur) {
    lines.push({ ...blankLine("caption", "code", block), text: cur });
  }
}

/** Turn a card title into a plausible filename for its window header. */
export function slugFile(title: string, ext = ".ts") {
  return (
    title
      .toLowerCase()
      .replace(/^tool:\s*/, "")
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "")
      .slice(0, MAX_FILE_STEM) + ext
  );
}

/** Longest row in a card, in characters (to pick a wrap width). */
export function longestRow(card: Card) {
  return Math.max(
    MIN_ROW_WIDTH,
    ...card.blocks.flatMap((b) =>
      b.rows.map(([, t]) => t.length + (b.view === "diff" ? 2 : 0)),
    ),
  );
}
