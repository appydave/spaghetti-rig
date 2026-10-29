import type { Line } from "#root/src/world/code-window/layout/types.ts";
import {
  drawMarks,
  LINE_MIDDLE,
} from "#root/src/world/code-window/paint/mark-painter.ts";
import { FONT, MONO } from "#root/src/world/code-window/paint/card-font.ts";
import {
  roundRect,
  type Box,
} from "#root/src/world/code-window/paint/shapes.ts";
import { CARD, LINE, type Mood, PALETTE } from "#root/src/world/palette.ts";

/** Everything drawLine needs about one line: where it sits, how wide a character is, the text gutter, the panel width and the mood's palette. */
export interface LineSpec {
  line: Line;
  x0: number;
  y: number;
  h: number;
  cw: number;
  gutter: number;
  inner: number;
  p: (typeof PALETTE)[Mood];
}

/** A caption line's text baseline below the top of the line. */
const CAPTION_BASELINE = 32;
/** The text baseline sits this share of the way down a code line. */
const BASELINE_SHARE = 0.7;
/** An output or diff panel bleeds past the text on each side, then on both sides together; a diff tint is this much shorter. */
const PANEL_BLEED = 14;
const PANEL_BLEED_BOTH = 28;
const DIFF_TINT_TRIM = 4;
/** A continuation arrow and a label line are drawn at these shares of the code font size. */
const CONT_FONT_SHARE = 0.8;
const LABEL_FONT_SHARE = 0.85;
/** A removed line is drawn at this opacity. */
const REMOVED_OPACITY = 0.78;
/** The strike-through runs this far past the text at each end. */
const STRIKE_OVERHANG = 4;
/** The box round an added line: padding each side (then both), top offset, minimum width in characters, height trim, corner radius. */
const ADDED_BOX_PAD = 7;
const ADDED_BOX_PAD_BOTH = ADDED_BOX_PAD * 2;
const ADDED_BOX_TOP = 5;
const ADDED_BOX_MIN_COLUMNS = 3;
const ADDED_BOX_TRIM = 10;
const ADDED_BOX_RADIUS = 7;

/** Where the line's text sits: its baseline, where its code starts, and how far the text runs (leading space and all). */
interface TextRun {
  base: number;
  tx: number;
  lead: number;
  textW: number;
}

function drawRule(g: CanvasRenderingContext2D, s: LineSpec) {
  g.strokeStyle = CARD.codeRule;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(s.x0, s.y + s.h / 2);
  g.lineTo(s.x0 + s.inner, s.y + s.h / 2);
  g.stroke();
}

function drawCaption(g: CanvasRenderingContext2D, s: LineSpec) {
  g.font = `500 31px Space, Arial, sans-serif`;
  g.fillStyle = CARD.caption;
  g.fillText(s.line.text, s.x0, s.y + CAPTION_BASELINE);
}

/** The panel behind an output line. */
function drawOutputPanel(g: CanvasRenderingContext2D, s: LineSpec) {
  g.fillStyle = s.p.output;
  g.fillRect(s.x0 - PANEL_BLEED, s.y, s.inner + PANEL_BLEED_BOTH, s.h);
}

/** The tint and +/- sign of an added or removed diff line. */
function drawDiffPanel(g: CanvasRenderingContext2D, s: LineSpec, base: number) {
  const added = s.line.diff === "a";

  g.fillStyle = added ? LINE.addedTint : LINE.removedTint;
  g.fillRect(
    s.x0 - PANEL_BLEED,
    s.y + 2,
    s.inner + PANEL_BLEED_BOTH,
    s.h - DIFF_TINT_TRIM,
  );
  if (!s.line.cont) {
    g.font = `700 ${FONT}px ${MONO}`;
    g.fillStyle = added ? LINE.addedSign : LINE.removedSign;
    g.fillText(added ? "+" : "−", s.x0, base);
  }
}

function drawContinuation(
  g: CanvasRenderingContext2D,
  s: LineSpec,
  base: number,
) {
  g.fillStyle = LINE.continuationArrow;
  g.font = `600 ${FONT * CONT_FONT_SHARE}px ${MONO}`;
  g.fillText("↳", s.x0 + (s.line.view === "diff" ? s.cw : 0), base);
}

/** A label line: its text, then its marks at the label's smaller size. */
function drawLabel(g: CanvasRenderingContext2D, s: LineSpec, base: number) {
  const { line } = s;
  const output = line.view === "output";

  g.font = `600 ${FONT * LABEL_FONT_SHARE}px ${MONO}`;
  g.fillStyle = output ? LINE.outputLabel : s.p.label;
  g.fillText((output ? "▸ " : "") + line.text, s.x0, base);
  drawMarks(g, {
    marks: line.marks,
    tx: s.x0 + (output ? s.cw * LABEL_FONT_SHARE * 2 : 0),
    y: s.y,
    h: s.h,
    cw: s.cw * LABEL_FONT_SHARE,
    line,
  });
}

function drawTokens(g: CanvasRenderingContext2D, s: LineSpec, run: TextRun) {
  let x = run.tx;

  g.font = `600 ${FONT}px ${MONO}`;
  g.globalAlpha = s.line.diff === "d" ? REMOVED_OPACITY : 1;
  for (const t of s.line.tokens) {
    g.fillStyle = t.color;
    g.fillText(t.text, x, run.base);
    x += t.text.length * s.cw;
  }

  g.globalAlpha = 1;
}

/** Removed: red strike-through. */
function drawStrike(g: CanvasRenderingContext2D, s: LineSpec, run: TextRun) {
  g.strokeStyle = LINE.strikeThrough;
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(run.tx + run.lead - STRIKE_OVERHANG, s.y + s.h * LINE_MIDDLE);
  g.lineTo(run.tx + run.textW + STRIKE_OVERHANG, s.y + s.h * LINE_MIDDLE);
  g.stroke();
}

/** Added: green box. */
function drawAddedBox(g: CanvasRenderingContext2D, s: LineSpec, run: TextRun) {
  const box: Box = {
    x: run.tx + run.lead - ADDED_BOX_PAD,
    y: s.y + ADDED_BOX_TOP,
    w: Math.max(
      s.cw * ADDED_BOX_MIN_COLUMNS,
      run.textW - run.lead + ADDED_BOX_PAD_BOTH,
    ),
    h: s.h - ADDED_BOX_TRIM,
  };

  g.strokeStyle = LINE.addedBoxOutline;
  g.lineWidth = 2.5;
  roundRect(g, box, ADDED_BOX_RADIUS);
  g.stroke();
}

function drawCode(g: CanvasRenderingContext2D, s: LineSpec, base: number) {
  const { line } = s;
  const run: TextRun = {
    base,
    tx: s.x0 + s.gutter,
    lead: (line.text.match(/^\s*/)?.[0].length ?? 0) * s.cw,
    textW: Math.max(s.cw * 2, line.text.trimEnd().length * s.cw),
  };

  drawTokens(g, s, run);
  if (line.view === "diff" && line.diff === "d") {
    drawStrike(g, s, run);
  }

  if (line.view === "diff" && line.diff === "a") {
    drawAddedBox(g, s, run);
  }

  drawMarks(g, {
    marks: line.marks,
    tx: run.tx,
    y: s.y,
    h: s.h,
    cw: s.cw,
    line,
  });
}

/** Draw one line of a card: a rule, a caption, or a code line with its panel, text and marks. */
export function drawLine(g: CanvasRenderingContext2D, s: LineSpec) {
  if (s.line.type === "rule") {
    drawRule(g, s);

    return;
  }

  if (s.line.type === "caption") {
    drawCaption(g, s);

    return;
  }

  const base = s.y + s.h * BASELINE_SHARE;

  if (s.line.view === "output") {
    drawOutputPanel(g, s);
  }

  if (s.line.view === "diff" && (s.line.diff === "a" || s.line.diff === "d")) {
    drawDiffPanel(g, s, base);
  }

  if (s.line.cont) {
    drawContinuation(g, s, base);
  }

  if (s.line.diff === "l") {
    drawLabel(g, s, base);

    return;
  }

  drawCode(g, s, base);
}
