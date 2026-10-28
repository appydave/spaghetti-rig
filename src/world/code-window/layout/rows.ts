import type { Card, RowKind, View } from "#root/src/content/types.ts";
import { present } from "#root/src/nth.ts";
import type { Line, Mark } from "#root/src/world/code-window/layout/types.ts";
import {
  sliceTokens,
  tokenize,
} from "#root/src/world/code-window/layout/tokenize.ts";
import { wrapPoints } from "#root/src/world/code-window/layout/wrap.ts";

/** Code is never wrapped narrower than this many columns, and a wrapped line indents at most this many. */
const MIN_CODE_COLUMNS = 12;
const MAX_WRAP_INDENT = 8;
/** Captions are prose in a proportional font: this many times as many characters fit on a line as code. */
const CAPTION_COLUMNS_FACTOR = 1.35;

/** What a row needs to be laid out: the card, its annotation pins and the wrap width. */
export interface RowContext {
  card: Card;
  pinOf: Map<object, number>;
  cols: number;
}
/** Where a row sits, and what is in it. */
export interface RowAt {
  block: number;
  row: number;
  view: View;
  kind: RowKind;
  text: string;
}
/** One wrapped chunk of a row, as character offsets. */
interface Chunk {
  from: number;
  to: number;
  first: boolean;
  last: boolean;
}

export function blankLine(type: Line["type"], view: View, block: number): Line {
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

export function pushCaption(
  lines: Line[],
  text: string,
  cols: number,
  block = -1,
) {
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

/** The annotation marks on one row, each spanning its matched text or the whole row. */
export function rowMarks(ctx: RowContext, at: RowAt): Mark[] {
  return ctx.card.annotations
    .filter((a) => a.block === at.block && a.row === at.row)
    .map((a) => {
      const idx = a.match ? at.text.indexOf(a.match) : -1;
      const whole = idx < 0;

      return {
        from: whole ? 0 : idx,
        to: whole ? Math.max(1, at.text.length) : idx + a.match.length,
        kind: a.kind,
        pin: present(ctx.pinOf.get(a), "the annotation pin"),
        whole,
      };
    });
}

/** The part of each mark that falls in one chunk; the pin shows on the chunk where its mark ends. */
function chunkMarks(marks: Mark[], chunk: Chunk, emptyRow: boolean): Mark[] {
  return marks.flatMap((m): Mark[] => {
    const s = Math.max(m.from, chunk.from);
    const e = Math.min(m.to, chunk.to);
    const emptyWhole = m.whole && chunk.first && emptyRow;

    if (e <= s && !emptyWhole) {
      return [];
    }

    return [
      {
        ...m,
        from: s - chunk.from,
        to: Math.max(s - chunk.from + 1, e - chunk.from),
        pin: chunk.last || m.to <= chunk.to ? m.pin : 0,
      },
    ];
  });
}

/** A code row as editor lines, wrapped to the card's width. */
export function codeLines(ctx: RowContext, at: RowAt, marks: Mark[]): Line[] {
  const { text, view, kind } = at;
  const tokens = tokenize(text, view, kind);
  const prefix = view === "diff" && kind !== "l" ? 2 : 0;
  const usable = Math.max(MIN_CODE_COLUMNS, ctx.cols - prefix);
  const indent = Math.min(
    MAX_WRAP_INDENT,
    (text.match(/^\s*/)?.[0].length ?? 0) + 2,
  );
  const cuts = wrapPoints(text, usable, indent);

  return cuts.map((from, ci) => {
    const to = cuts[ci + 1] ?? text.length;
    const chunk = { from, to, first: ci === 0, last: ci === cuts.length - 1 };

    return {
      type: "code",
      view,
      diff: kind,
      text: text.slice(from, to),
      tokens: sliceTokens(tokens, from, to),
      marks: chunkMarks(marks, chunk, text.length === 0),
      cont: ci > 0,
      block: at.block,
      row: at.row,
    };
  });
}
