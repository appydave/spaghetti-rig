import type { Layout } from "#root/src/world/code-window/layout/types.ts";
import {
  FOOT_FONT,
  FOOT_LINE,
  FOOT_TOP,
  HEADER,
  NOTE_FONT,
  NOTE_GAP,
  NOTE_LINE,
  NOTES_TOP,
  PAD,
  TITLE_BOTTOM,
  TITLE_FONT,
  TITLE_LINE,
  type Paint,
} from "#root/src/world/code-window/paint/card-measure.ts";
import {
  pin,
  roundRect,
  type Point,
} from "#root/src/world/code-window/paint/shapes.ts";
import { INK } from "#root/src/world/models/toon.ts";
import { nth } from "#root/src/nth.ts";
import { CARD, PIN, PALETTE, type Mood } from "#root/src/world/palette.ts";

/** The label line: baseline below the bar, and the space between its letters. */
const LABEL_BASELINE = 40;
const LABEL_TRACKING = 4;
/** The badge: padding around its text, how far it rises above the label baseline, its height and corner radius, and its text offset. */
const BADGE_PAD = 34;
const BADGE_RISE = 30;
const BADGE_HEIGHT = 58;
const BADGE_RADIUS = 8;
const BADGE_TEXT_X = 17;
const BADGE_TEXT_Y = 12;
/** The dashed rule above the notes: dash and gap length. */
const RULE_DASH = 8;
/** A note's pin sits this far in and down; its text starts this far in and sits this far down. */
const NOTE_PIN_OFFSET = 18;
const NOTE_TEXT_INDENT = 52;
const NOTE_BASELINE = 29;
/** Where the footer's text sits within a line. */
const FOOT_BASELINE = 26;

/** Draw a string one letter at a time, with a fixed space between letters. */
function spaced(
  g: CanvasRenderingContext2D,
  s: string,
  at: Point,
  tracking: number,
) {
  let { x } = at;

  for (const ch of s) {
    g.fillText(ch, x, at.y);
    x += g.measureText(ch).width + tracking;
  }
}

/** What the heading needs: the card's width, mood and palette, what it says, and the title wrapped to lines. */
export interface HeadingSpec {
  width: number;
  mood: Mood;
  p: (typeof PALETTE)[Mood];
  paint: Paint;
  titleLines: string[];
}

/** The label, the badge and the title. Returns the y below them. */
export function paintHeading(g: CanvasRenderingContext2D, spec: HeadingSpec) {
  const { width, mood, p, paint } = spec;
  let y = HEADER + LABEL_BASELINE;

  g.textBaseline = "alphabetic";
  g.font = `600 22px Space, Arial, sans-serif`;
  g.fillStyle = p.label;
  spaced(g, paint.label.toUpperCase(), { x: PAD, y }, LABEL_TRACKING);
  if (paint.badge) {
    g.font = `italic 800 40px Barlow, Impact, sans-serif`;

    const bw = g.measureText(paint.badge).width + BADGE_PAD;

    g.fillStyle = mood === "angry" ? CARD.badgeAngry : CARD.badgeCalm;
    roundRect(
      g,
      { x: width - PAD - bw, y: y - BADGE_RISE, w: bw, h: BADGE_HEIGHT },
      BADGE_RADIUS,
    );
    g.fill();
    g.fillStyle = INK;
    g.fillText(paint.badge, width - PAD - bw + BADGE_TEXT_X, y + BADGE_TEXT_Y);
  }

  g.font = TITLE_FONT;
  g.fillStyle = p.title;
  for (const t of spec.titleLines) {
    y += TITLE_LINE;
    g.fillText(t, PAD, y);
  }

  return y + TITLE_BOTTOM;
}

/** What the notes need: the card's width, the notes and their wrapped lines. */
export interface NotesSpec {
  width: number;
  notes: Layout["notes"];
  noteLines: string[][];
}

/** The dashed rule and the pinned notes under the code. Returns the y below them. */
export function paintNotes(
  g: CanvasRenderingContext2D,
  top: number,
  spec: NotesSpec,
) {
  let y = top;

  g.strokeStyle = CARD.notesRule;
  g.lineWidth = 2;
  g.setLineDash([RULE_DASH, RULE_DASH]);
  g.beginPath();
  g.moveTo(PAD, y);
  g.lineTo(spec.width - PAD, y);
  g.stroke();
  g.setLineDash([]);
  y += NOTES_TOP;
  for (const [i, n] of spec.notes.entries()) {
    const ls = nth(spec.noteLines, i, "note lines");

    pin(
      g,
      { x: PAD + NOTE_PIN_OFFSET, y: y + NOTE_PIN_OFFSET },
      n.pin,
      PIN[n.kind],
    );
    g.font = NOTE_FONT;
    g.fillStyle = CARD.note;
    for (const [j, l] of ls.entries()) {
      g.fillText(l, PAD + NOTE_TEXT_INDENT, y + NOTE_BASELINE + j * NOTE_LINE);
    }

    y += Math.max(1, ls.length) * NOTE_LINE + NOTE_GAP;
  }

  return y;
}

/** The footer text. Returns the y below it. */
export function paintFooter(
  g: CanvasRenderingContext2D,
  top: number,
  mood: Mood,
  footLines: string[],
) {
  if (!footLines.length) {
    return top;
  }

  let y = top + FOOT_TOP;

  g.font = FOOT_FONT;
  g.fillStyle = mood === "angry" ? CARD.footerAngry : CARD.footerCalm;
  for (const l of footLines) {
    g.fillText(l, PAD, y + FOOT_BASELINE);
    y += FOOT_LINE;
  }

  return y;
}
