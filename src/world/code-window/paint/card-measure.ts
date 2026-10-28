import type { Layout, Line } from "#root/src/world/code-window/codelayout.ts";
import { wrap as wrapProse } from "#root/src/world/code-window/canvas-text.ts";
import { FONT, MONO } from "#root/src/world/code-window/paint/shapes.ts";

export const LH = 50;
export const PAD = 44;
export const HEADER = 74;

// The card's layout, in canvas pixels. Sizes grow with the content: the card is as wide as its code and as tall as its parts.
/** The width of a character is measured on this many of them, then divided. */
const CHAR_SAMPLE_COUNT = 10;
/** The line-number gutter is this many character widths wide. */
const GUTTER_COLUMNS = 2.2;
/** A title next to a badge wraps this much narrower; a note wraps this much narrower to leave room for its pin. */
const BADGE_RESERVE = 140;
const NOTE_INDENT = 64;
/** Line heights that differ from the code line height LH. */
const RULE_HEIGHT = 34;
const CAPTION_HEIGHT = 44;
/** The title block: space above, per wrapped line, and below. */
const TITLE_TOP = 40;

export const TITLE_LINE = 62;
export const TITLE_BOTTOM = 18;
/** Space under the code. */
export const CODE_BOTTOM = 24;
/** The notes block: space above it, per wrapped line, and between notes. */
export const NOTES_TOP = 26;
export const NOTE_LINE = 40;
export const NOTE_GAP = 8;
/** The footer: space above it and per wrapped line. */
export const FOOT_TOP = 18;
export const FOOT_LINE = 38;

/** The bottom margin is this share of the side padding. */
const BOTTOM_PAD_SHARE = 0.8;

/** The fonts the card is measured and painted in. */
export const TITLE_FONT = `italic 800 66px Barlow, Impact, sans-serif`;
export const NOTE_FONT = `500 30px Space, Arial, sans-serif`;
export const FOOT_FONT = `500 28px Space, Arial, sans-serif`;

/** What a card says, apart from its code. */
export interface Paint {
  label: string;
  title: string;
  footer?: string;
  badge?: string;
}

/** The size of a card and the text lines it wraps to. */
export interface CardSize {
  cw: number;
  gutter: number;
  width: number;
  height: number;
  inner: number;
  titleLines: string[];
  noteLines: string[][];
  footLines: string[];
}

/** The height of one line of code. */
export function lineHeight(l: Line) {
  if (l.type === "rule") {
    return RULE_HEIGHT;
  }

  return l.type === "caption" ? CAPTION_HEIGHT : LH;
}

/** Measure a card: its character width, its wrapped text and the canvas size they need. */
export function measureCard(
  g: CanvasRenderingContext2D,
  layout: Layout,
  paint: Paint,
): CardSize {
  g.font = `600 ${FONT}px ${MONO}`;

  const cw = g.measureText("MMMMMMMMMM").width / CHAR_SAMPLE_COUNT;
  const gutter = cw * GUTTER_COLUMNS;
  const width = Math.ceil(PAD * 2 + gutter + layout.cols * cw);
  const inner = width - PAD * 2;

  g.font = TITLE_FONT;

  const titleLines = wrapProse(
    g,
    paint.title.toUpperCase(),
    inner - (paint.badge ? BADGE_RESERVE : 0),
  );

  g.font = NOTE_FONT;

  const noteLines = layout.notes.map((n) =>
    wrapProse(g, n.note, inner - NOTE_INDENT),
  );

  g.font = FOOT_FONT;

  const footLines = paint.footer ? wrapProse(g, paint.footer, inner) : [];
  const titleH = TITLE_TOP + titleLines.length * TITLE_LINE + TITLE_BOTTOM;
  const codeH =
    layout.lines.reduce((s, l) => s + lineHeight(l), 0) + CODE_BOTTOM;
  const notesH = layout.notes.length
    ? NOTES_TOP +
      noteLines.reduce(
        (s, l) => s + Math.max(1, l.length) * NOTE_LINE + NOTE_GAP,
        0,
      )
    : 0;
  const footH = footLines.length ? FOOT_TOP + footLines.length * FOOT_LINE : 0;
  const height = Math.ceil(
    HEADER + titleH + codeH + notesH + footH + PAD * BOTTOM_PAD_SHARE,
  );

  return { cw, gutter, width, height, inner, titleLines, noteLines, footLines };
}
