import type { Line, Mark } from "#root/src/world/code-window/codelayout.ts";
import {
  pin,
  roundRect,
  type Box,
} from "#root/src/world/code-window/paint/shapes.ts";
import { LINE, MARK, PIN } from "#root/src/world/palette.ts";

/** Where a line's marks go: the text's left edge, the line's top and height, the character width, and the line. */
export interface MarksSpec {
  marks: Mark[];
  tx: number;
  y: number;
  h: number;
  cw: number;
  line: Line;
}

/** Where one mark runs along the line. */
interface Span {
  x1: number;
  x2: number;
}

/** A line's middle is this share of its height down (strike-throughs and rules are drawn there). */
export const LINE_MIDDLE = 0.5;

/** Pins sit this far after the end of the line's text (and of a mark), then step this far apart. */
const PIN_GAP = 24;
const PIN_STEP = 36;
/** A mark on an empty line spans this many characters. */
const EMPTY_MARK_COLUMNS = 10;
/** A strike-through mark runs this far past the code at each end. */
const MARK_OVERHANG = 3;
/** The red squiggle: how far above the line's bottom it runs, its wavelength and its height. */
const SQUIGGLE_RISE = 7;
const SQUIGGLE_WAVELENGTH = 5;
const SQUIGGLE_AMPLITUDE = 4.5;
/** The dashed underline of a note: dash length, gap, and how far above the line's bottom it runs. */
const NOTE_DASH = 10;
const NOTE_DASH_GAP = 6;
const NOTE_UNDERLINE_RISE = 6;
/** The rounded box round a fix or number mark: padding each side (then both), top offset, height trim, corner radius. */
const MARK_BOX_PAD = 6;
const MARK_BOX_PAD_BOTH = MARK_BOX_PAD * 2;
const MARK_BOX_TOP = 3;
const MARK_BOX_TRIM = 6;
const MARK_BOX_RADIUS = 7;
/** A mark's pin sits this far below the top of the line. */
const MARK_PIN_DROP = 14;

function spanOf(m: Mark, s: MarksSpec): Span {
  const empty = s.line.text.trim() === "";

  return {
    x1: s.tx + (empty ? 0 : m.from * s.cw),
    x2: s.tx + (empty ? s.cw * EMPTY_MARK_COLUMNS : m.to * s.cw),
  };
}

/** A problem mark: a strike-through in the diff view, an editor-style red squiggle everywhere else. */
function problemMark(
  g: CanvasRenderingContext2D,
  s: MarksSpec,
  span: Span,
  col: string,
) {
  g.strokeStyle = col;
  if (s.line.view === "diff") {
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(span.x1 - MARK_OVERHANG, s.y + s.h * LINE_MIDDLE);
    g.lineTo(span.x2 + MARK_OVERHANG, s.y + s.h * LINE_MIDDLE);
  } else {
    g.lineWidth = 4;
    g.beginPath();
    for (let x = span.x1; x <= span.x2; x += 2) {
      g.lineTo(
        x,
        s.y +
          s.h -
          SQUIGGLE_RISE +
          Math.sin((x - span.x1) / SQUIGGLE_WAVELENGTH) * SQUIGGLE_AMPLITUDE,
      );
    }
  }

  g.stroke();
}

function dashedUnderline(
  g: CanvasRenderingContext2D,
  s: MarksSpec,
  span: Span,
  col: string,
) {
  g.strokeStyle = col;
  g.lineWidth = 5;
  g.setLineDash([NOTE_DASH, NOTE_DASH_GAP]);
  g.beginPath();
  g.moveTo(span.x1, s.y + s.h - NOTE_UNDERLINE_RISE);
  g.lineTo(span.x2, s.y + s.h - NOTE_UNDERLINE_RISE);
  g.stroke();
  g.setLineDash([]);
}

/** A fix mark is filled; every box mark is outlined. */
function boxMark(
  g: CanvasRenderingContext2D,
  s: MarksSpec,
  span: Span,
  m: Mark,
) {
  const box: Box = {
    x: span.x1 - MARK_BOX_PAD,
    y: s.y + MARK_BOX_TOP,
    w: span.x2 - span.x1 + MARK_BOX_PAD_BOTH,
    h: s.h - MARK_BOX_TRIM,
  };

  g.strokeStyle = MARK[m.kind];
  g.lineWidth = 4.5;
  if (m.kind === "fix") {
    g.fillStyle = LINE.fixMarkFill;
    roundRect(g, box, MARK_BOX_RADIUS);
    g.fill();
  }

  roundRect(g, box, MARK_BOX_RADIUS);
  g.stroke();
}

function drawMark(
  g: CanvasRenderingContext2D,
  s: MarksSpec,
  span: Span,
  m: Mark,
) {
  if (m.kind === "note") {
    dashedUnderline(g, s, span, MARK[m.kind]);
  } else if (m.kind === "problem") {
    problemMark(g, s, span, MARK[m.kind]);
  } else {
    boxMark(g, s, span, m);
  }
}

export function drawMarks(g: CanvasRenderingContext2D, s: MarksSpec) {
  // Pins sit after the line's last character, so they never cover the code that follows a mark.
  let pinX = s.tx + Math.max(s.line.text.trimEnd().length * s.cw, 0) + PIN_GAP;

  for (const m of s.marks) {
    const span = spanOf(m, s);

    drawMark(g, s, span, m);
    if (m.pin) {
      pinX = Math.max(pinX, span.x2 + PIN_GAP);
      pin(g, { x: pinX, y: s.y + MARK_PIN_DROP }, m.pin, PIN[m.kind]);
      pinX += PIN_STEP;
    }
  }
}
