import * as THREE from "three";
import type { Layout, Line, Mark } from "./codelayout";
import { Debris } from "./physics";
import { INK, kit, rng, toon } from "./toon";
import { meshNamed } from "./objects";
import { context2d } from "../dom";
import { nth } from "../nth";

export type Mood = "angry" | "calm" | "fixed" | "boss";

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const FONT = 34;
const LH = 50;
const PAD = 44;
const HEADER = 74;

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
const TITLE_LINE = 62;
const TITLE_BOTTOM = 18;
/** Space under the code. */
const CODE_BOTTOM = 24;
/** The notes block: space above it, per wrapped line, and between notes. */
const NOTES_TOP = 26;
const NOTE_LINE = 40;
const NOTE_GAP = 8;
/** The footer: space above it and per wrapped line, and where its text sits within a line. */
const FOOT_TOP = 18;
const FOOT_LINE = 38;
const FOOT_BASELINE = 26;
/** The bottom margin is this share of the side padding. */
const BOTTOM_PAD_SHARE = 0.8;
/** The slab: corner radius, the edge stroke and where it is drawn, and its own corner radius. */
const SLAB_RADIUS = 30;
const EDGE_WIDTH = 10;
const EDGE_INSET = 5;
const EDGE_RADIUS = 26;
/** The title bar: inset from the edge (each side, then both), trimmed height, corner radius, and how far its fill overhangs. */
const BAR_INSET = 10;
const BAR_WIDTH_TRIM = 20;
const BAR_HEIGHT_TRIM = 4;
const BAR_RADIUS = 22;
const BAR_OVERHANG = 10;
/** The three window dots: first dot's x, spacing, count, drop below the bar's middle, radius. */
const DOT_X = 46;
const DOT_STEP = 34;
const DOT_COUNT = 3;
const DOT_DROP = 4;
const DOT_RADIUS = 11;
/** The file name: gap after the dots, drop below the bar's middle, and the columns kept free before it is cut short. */
const FILENAME_GAP = 8;
const FILENAME_DROP = 5;
const FILENAME_MARGIN = 8;
const FILENAME_CUT_MARGIN = 9;
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

export const PALETTE: Record<
  Mood,
  {
    body: string;
    header: string;
    edge: string;
    side: string;
    label: string;
    title: string;
    output: string;
  }
> = {
  angry: {
    body: "#3a1b26",
    header: "#c4473f",
    edge: "#ff9f7f",
    side: "#7c2f33",
    label: "#ffb7a3",
    title: "#ffd96a",
    output: "#2c1520",
  },
  calm: {
    body: "#122d40",
    header: "#35556b",
    edge: "#8ebebf",
    side: "#547e92",
    label: "#9fc3d6",
    title: "#ffd96a",
    output: "#0d2333",
  },
  fixed: {
    body: "#122d40",
    header: "#35556b",
    edge: "#aee5a3",
    side: "#547e92",
    label: "#aee5a3",
    title: "#d6f5c9",
    output: "#0d2333",
  },
  boss: {
    body: "#2f202a",
    header: "#8b3329",
    edge: "#ffae59",
    side: "#e85b2b",
    label: "#ffae59",
    title: "#ffd96a",
    output: "#26161f",
  },
};

const MARK = {
  problem: "#ff5d4f",
  fix: "#8ef08a",
  note: "#ffbf47",
  number: "#ffbf47",
};
const PIN = {
  problem: "#ff5d4f",
  fix: "#4fc46a",
  note: "#ffb52e",
  number: "#ffb52e",
};

export interface Paint {
  label: string;
  title: string;
  footer?: string;
  badge?: string;
}

function wrapProse(
  g: CanvasRenderingContext2D,
  text: string,
  width: number,
): string[] {
  const out: string[] = [];
  let cur = "";

  for (const w of text.split(/\s+/)) {
    const next = cur ? `${cur} ${w}` : w;

    if (g.measureText(next).width > width && cur) {
      out.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }

  if (cur) {
    out.push(cur);
  }

  return out;
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Paint a card as an editor window. The canvas size follows the content. */
export function paintCard(
  layout: Layout,
  mood: Mood,
  paint: Paint,
): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  const g = context2d(cv);

  g.font = `600 ${FONT}px ${MONO}`;

  const cw = g.measureText("MMMMMMMMMM").width / CHAR_SAMPLE_COUNT;
  const gutter = cw * GUTTER_COLUMNS;
  const width = Math.ceil(PAD * 2 + gutter + layout.cols * cw);
  const inner = width - PAD * 2;

  // Measure everything first.
  g.font = `italic 800 66px Barlow, Impact, sans-serif`;

  const titleLines = wrapProse(
    g,
    paint.title.toUpperCase(),
    inner - (paint.badge ? BADGE_RESERVE : 0),
  );

  g.font = `500 30px Space, Arial, sans-serif`;

  const noteLines = layout.notes.map((n) =>
    wrapProse(g, n.note, inner - NOTE_INDENT),
  );

  g.font = `500 28px Space, Arial, sans-serif`;

  const footLines = paint.footer ? wrapProse(g, paint.footer, inner) : [];
  const lineH = (l: Line) =>
    l.type === "rule"
      ? RULE_HEIGHT
      : l.type === "caption"
        ? CAPTION_HEIGHT
        : LH;
  const titleH = TITLE_TOP + titleLines.length * TITLE_LINE + TITLE_BOTTOM;
  const codeH = layout.lines.reduce((s, l) => s + lineH(l), 0) + CODE_BOTTOM;
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

  cv.width = width;
  cv.height = height;

  const p = PALETTE[mood];

  // Body with a bright inner edge (the slab's front lip).
  g.fillStyle = p.body;
  roundRect(g, 0, 0, width, height, SLAB_RADIUS);
  g.fill();
  g.lineWidth = EDGE_WIDTH;
  g.strokeStyle = p.edge;
  roundRect(
    g,
    EDGE_INSET,
    EDGE_INSET,
    width - EDGE_WIDTH,
    height - EDGE_WIDTH,
    EDGE_RADIUS,
  );
  g.stroke();
  // Title bar.
  g.save();
  roundRect(
    g,
    BAR_INSET,
    BAR_INSET,
    width - BAR_WIDTH_TRIM,
    HEADER - BAR_HEIGHT_TRIM,
    BAR_RADIUS,
  );
  g.clip();
  g.fillStyle = p.header;
  g.fillRect(0, 0, width, HEADER + BAR_OVERHANG);
  g.restore();
  for (const [i, c] of ["#ff8b69", "#ffd96a", "#aee5a3"].entries()) {
    g.fillStyle = c;
    g.beginPath();
    g.arc(
      DOT_X + i * DOT_STEP,
      HEADER / 2 + DOT_DROP,
      DOT_RADIUS,
      0,
      Math.PI * 2,
    );
    g.fill();
  }

  g.font = `600 28px ${MONO}`;
  g.fillStyle = "#f4f4e8";
  g.textBaseline = "middle";

  const fname =
    layout.filename.length > layout.cols - FILENAME_MARGIN
      ? `…${layout.filename.slice(-(layout.cols - FILENAME_CUT_MARGIN))}`
      : layout.filename;

  g.fillText(
    fname,
    DOT_X + DOT_COUNT * DOT_STEP + FILENAME_GAP,
    HEADER / 2 + FILENAME_DROP,
  );

  let y = HEADER + LABEL_BASELINE;

  g.textBaseline = "alphabetic";
  g.font = `600 22px Space, Arial, sans-serif`;
  g.fillStyle = p.label;
  spaced(g, paint.label.toUpperCase(), PAD, y, LABEL_TRACKING);
  if (paint.badge) {
    g.font = `italic 800 40px Barlow, Impact, sans-serif`;

    const bw = g.measureText(paint.badge).width + BADGE_PAD;

    g.fillStyle = mood === "angry" ? "#de6a47" : "#f9db48";
    roundRect(
      g,
      width - PAD - bw,
      y - BADGE_RISE,
      bw,
      BADGE_HEIGHT,
      BADGE_RADIUS,
    );
    g.fill();
    g.fillStyle = INK;
    g.fillText(paint.badge, width - PAD - bw + BADGE_TEXT_X, y + BADGE_TEXT_Y);
  }

  g.font = `italic 800 66px Barlow, Impact, sans-serif`;
  g.fillStyle = p.title;
  for (const t of titleLines) {
    y += TITLE_LINE;
    g.fillText(t, PAD, y);
  }

  y += TITLE_BOTTOM;

  // Code.
  const top = y;

  for (const line of layout.lines) {
    const h = lineH(line);

    drawLine(g, line, PAD, y, h, cw, gutter, inner, p);
    y += h;
  }

  y += CODE_BOTTOM;
  // Output blocks get their own darker panel drawn underneath; re-tint by redrawing behind is costly, so it's inline above.
  void top;

  if (layout.notes.length) {
    g.strokeStyle = "rgba(214,226,240,.22)";
    g.lineWidth = 2;
    g.setLineDash([RULE_DASH, RULE_DASH]);
    g.beginPath();
    g.moveTo(PAD, y);
    g.lineTo(width - PAD, y);
    g.stroke();
    g.setLineDash([]);
    y += NOTES_TOP;
    for (const [i, n] of layout.notes.entries()) {
      const ls = nth(noteLines, i, "note lines");

      pin(g, PAD + NOTE_PIN_OFFSET, y + NOTE_PIN_OFFSET, n.pin, PIN[n.kind]);
      g.font = `500 30px Space, Arial, sans-serif`;
      g.fillStyle = "#e6eef7";
      for (const [j, l] of ls.entries()) {
        g.fillText(
          l,
          PAD + NOTE_TEXT_INDENT,
          y + NOTE_BASELINE + j * NOTE_LINE,
        );
      }

      y += Math.max(1, ls.length) * NOTE_LINE + NOTE_GAP;
    }
  }

  if (footLines.length) {
    y += FOOT_TOP;
    g.font = `500 28px Space, Arial, sans-serif`;
    g.fillStyle = mood === "angry" ? "#ffcdbd" : "#b9d3e3";
    for (const l of footLines) {
      g.fillText(l, PAD, y + FOOT_BASELINE);
      y += FOOT_LINE;
    }
  }

  return cv;
}

function spaced(
  g: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  tracking: number,
) {
  for (const ch of s) {
    g.fillText(ch, x, y);
    x += g.measureText(ch).width + tracking;
  }
}

/** A pin: its radius, and how far below its centre the number's baseline sits. */
const PIN_RADIUS = 16;
const PIN_DIGIT_DROP = 7;

function pin(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  n: number,
  color: string,
) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, PIN_RADIUS, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = "#0b1d29";
  g.stroke();
  g.fillStyle = "#0b1d29";
  g.font = `700 21px Space, Arial, sans-serif`;
  g.textAlign = "center";
  g.fillText(String(n), x, y + PIN_DIGIT_DROP);
  g.textAlign = "left";
}

/** A caption line's text baseline below the top of the line. */
const CAPTION_BASELINE = 32;
/** The text baseline sits this share of the way down a code line. */
const BASELINE_SHARE = 0.7;
/** A line's middle is this share of its height down (strike-throughs and rules are drawn there). */
const LINE_MIDDLE = 0.5;
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
const ADDED_BOX_PAD_BOTH = 14;
const ADDED_BOX_TOP = 5;
const ADDED_BOX_MIN_COLUMNS = 3;
const ADDED_BOX_TRIM = 10;
const ADDED_BOX_RADIUS = 7;

function drawLine(
  g: CanvasRenderingContext2D,
  line: Line,
  x0: number,
  y: number,
  h: number,
  cw: number,
  gutter: number,
  inner: number,
  p: (typeof PALETTE)[Mood],
) {
  if (line.type === "rule") {
    g.strokeStyle = "rgba(214,226,240,.25)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x0, y + h / 2);
    g.lineTo(x0 + inner, y + h / 2);
    g.stroke();

    return;
  }

  if (line.type === "caption") {
    g.font = `500 31px Space, Arial, sans-serif`;
    g.fillStyle = "#f4f4e8";
    g.fillText(line.text, x0, y + CAPTION_BASELINE);

    return;
  }

  const base = y + h * BASELINE_SHARE;
  const tx = x0 + gutter;

  if (line.view === "output") {
    g.fillStyle = p.output;
    g.fillRect(x0 - PANEL_BLEED, y, inner + PANEL_BLEED_BOTH, h);
  }

  if (line.view === "diff" && (line.diff === "a" || line.diff === "d")) {
    g.fillStyle =
      line.diff === "a" ? "rgba(126,220,140,.15)" : "rgba(222,106,71,.17)";
    g.fillRect(
      x0 - PANEL_BLEED,
      y + 2,
      inner + PANEL_BLEED_BOTH,
      h - DIFF_TINT_TRIM,
    );
    if (!line.cont) {
      g.font = `700 ${FONT}px ${MONO}`;
      g.fillStyle = line.diff === "a" ? "#8ef08a" : "#ff7b6b";
      g.fillText(line.diff === "a" ? "+" : "−", x0, base);
    }
  }

  if (line.cont) {
    g.fillStyle = "rgba(125,166,198,.5)";
    g.font = `600 ${FONT * CONT_FONT_SHARE}px ${MONO}`;
    g.fillText("↳", x0 + (line.view === "diff" ? cw : 0), base);
  }

  if (line.diff === "l") {
    g.font = `600 ${FONT * LABEL_FONT_SHARE}px ${MONO}`;
    g.fillStyle = line.view === "output" ? "#ffd96a" : p.label;
    g.fillText((line.view === "output" ? "▸ " : "") + line.text, x0, base);
    drawMarks(
      g,
      line.marks,
      x0 + (line.view === "output" ? cw * LABEL_FONT_SHARE * 2 : 0),
      y,
      h,
      cw * LABEL_FONT_SHARE,
      line,
    );

    return;
  }

  g.font = `600 ${FONT}px ${MONO}`;

  let x = tx;

  g.globalAlpha = line.diff === "d" ? REMOVED_OPACITY : 1;
  for (const t of line.tokens) {
    g.fillStyle = t.color;
    g.fillText(t.text, x, base);
    x += t.text.length * cw;
  }

  g.globalAlpha = 1;

  const textW = Math.max(cw * 2, line.text.trimEnd().length * cw);
  const lead = (line.text.match(/^\s*/)?.[0].length ?? 0) * cw;

  if (line.diff === "d" && line.view === "diff") {
    // Removed: red strike-through.
    g.strokeStyle = "#ff6b5a";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(tx + lead - STRIKE_OVERHANG, y + h * LINE_MIDDLE);
    g.lineTo(tx + textW + STRIKE_OVERHANG, y + h * LINE_MIDDLE);
    g.stroke();
  }

  if (line.diff === "a" && line.view === "diff") {
    // Added: green box.
    g.strokeStyle = "rgba(142,240,138,.75)";
    g.lineWidth = 2.5;
    roundRect(
      g,
      tx + lead - ADDED_BOX_PAD,
      y + ADDED_BOX_TOP,
      Math.max(cw * ADDED_BOX_MIN_COLUMNS, textW - lead + ADDED_BOX_PAD_BOTH),
      h - ADDED_BOX_TRIM,
      ADDED_BOX_RADIUS,
    );
    g.stroke();
  }

  drawMarks(g, line.marks, tx, y, h, cw, line);
}

function drawMarks(
  g: CanvasRenderingContext2D,
  marks: Mark[],
  tx: number,
  y: number,
  h: number,
  cw: number,
  line: Line,
) {
  // Pins sit after the line's last character, so they never cover the code that follows a mark.
  let pinX = tx + Math.max(line.text.trimEnd().length * cw, 0) + 24;

  for (const m of marks) {
    const empty = line.text.trim() === "";
    const x1 = tx + (empty ? 0 : m.from * cw);
    const x2 = tx + (empty ? cw * 10 : m.to * cw);
    const col = MARK[m.kind];

    if (m.kind === "problem") {
      if (line.view === "diff") {
        g.strokeStyle = col;
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(x1 - 3, y + h * 0.5);
        g.lineTo(x2 + 3, y + h * 0.5);
        g.stroke();
      } else {
        // Editor-style red squiggle.
        g.strokeStyle = col;
        g.lineWidth = 4;
        g.beginPath();

        const yy = y + h - 7;

        for (let x = x1; x <= x2; x += 2) {
          g.lineTo(x, yy + Math.sin((x - x1) / 5) * 4.5);
        }

        g.stroke();
      }
    } else if (m.kind === "note") {
      g.strokeStyle = col;
      g.lineWidth = 5;
      g.setLineDash([10, 6]);
      g.beginPath();
      g.moveTo(x1, y + h - 6);
      g.lineTo(x2, y + h - 6);
      g.stroke();
      g.setLineDash([]);
    } else {
      g.strokeStyle = col;
      g.lineWidth = 4.5;
      if (m.kind === "fix") {
        g.fillStyle = "rgba(142,240,138,.13)";
        roundRect(g, x1 - 6, y + 3, x2 - x1 + 12, h - 6, 7);
        g.fill();
      }

      roundRect(g, x1 - 6, y + 3, x2 - x1 + 12, h - 6, 7);
      g.stroke();
    }

    if (m.pin) {
      pinX = Math.max(pinX, x2 + 24);
      pin(g, pinX, y + 14, m.pin, PIN[m.kind]);
      pinX += 36;
    }
  }
}

/** Draw a spray of glass cracks from a point (canvas px). */
export function paintCracks(
  cv: HTMLCanvasElement,
  seed: number,
  cx?: number,
  cy?: number,
) {
  const g = context2d(cv);
  const r = rng(seed);
  const x0 = cx ?? cv.width * (0.3 + r() * 0.4);
  const y0 = cy ?? cv.height * (0.3 + r() * 0.4);
  const arms = 9 + Math.floor(r() * 5);

  for (const [w, c] of [
    [7, "rgba(10,20,30,.55)"],
    [3, "rgba(240,250,255,.95)"],
  ] as const) {
    const rr = rng(seed);

    g.strokeStyle = c;
    g.lineWidth = w;
    g.lineJoin = "round";
    for (let i = 0; i < arms; i++) {
      let a = (i / arms) * Math.PI * 2 + rr() * 0.5;
      let x = x0;
      let y = y0;
      const len = Math.max(cv.width, cv.height) * (0.25 + rr() * 0.4);

      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 7; s++) {
        a += (rr() - 0.5) * 0.7;
        x += (Math.cos(a) * len) / 7;
        y += (Math.sin(a) * len) / 7;
        g.lineTo(x, y);
      }

      g.stroke();
    }

    // A ring of short cross-cracks.
    for (let i = 0; i < arms; i++) {
      const a = rr() * Math.PI * 2;
      const d = 50 + rr() * 90;

      g.beginPath();
      g.moveTo(x0 + Math.cos(a) * d, y0 + Math.sin(a) * d);
      g.lineTo(
        x0 + Math.cos(a + 0.5) * d * 1.1,
        y0 + Math.sin(a + 0.5) * d * 1.1,
      );
      g.stroke();
    }
  }

  g.fillStyle = "rgba(255,255,255,.85)";
  g.beginPath();
  g.arc(x0, y0, 14, 0, Math.PI * 2);
  g.fill();
}

/** Rounded rectangle outline used for the slab. */
function slabShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();

  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);

  return s;
}

/** Extrude a shape and map its caps onto the window's texture by absolute position. */
function extrudeMapped(
  shape: THREE.Shape,
  depth: number,
  w: number,
  h: number,
  bevel: number,
) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 5,
    steps: 1,
  });

  geo.translate(0, 0, -depth / 2);

  const pos = geo.getAttribute("position");
  const uv = geo.getAttribute("uv");
  const caps = nth(geo.groups, 0, "geometry groups");

  for (let i = caps.start; i < caps.start + caps.count; i++) {
    uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  }

  uv.needsUpdate = true;

  return geo;
}

/** A chunky 3D editor window: thick slab, painted face, optional angry eyes. */
export class CodeWindow {
  readonly group = new THREE.Group();
  readonly face: THREE.MeshBasicMaterial;
  readonly side: THREE.MeshToonMaterial;
  readonly texture: THREE.CanvasTexture;
  readonly w: number;
  readonly h: number;
  readonly depth: number;
  eyes?: THREE.Group;
  private cracks = 0;
  private t = Math.random() * 10;
  rattle = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    worldWidth: number,
    readonly mood: Mood,
    opts: { maxHeight?: number; depth?: number; eyes?: boolean } = {},
  ) {
    let w = worldWidth;
    let h = (worldWidth * canvas.height) / canvas.width;

    if (opts.maxHeight && h > opts.maxHeight) {
      w *= opts.maxHeight / h;
      h = opts.maxHeight;
    }

    this.w = w;
    this.h = h;
    this.depth = opts.depth ?? Math.max(0.16, w * 0.04);
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.face = new THREE.MeshBasicMaterial({
      map: this.texture,
      toneMapped: false,
    });
    this.side = new THREE.MeshToonMaterial({
      color: PALETTE[mood].side,
      gradientMap: toon("#fff").gradientMap,
    });

    const geo = extrudeMapped(
      slabShape(w, h, Math.min(w, h) * 0.035),
      this.depth,
      w,
      h,
      0.02,
    );
    const slab = new THREE.Mesh(geo, [this.face, this.side]);

    slab.name = "code-slab";
    slab.castShadow = true;
    slab.receiveShadow = false;
    this.group.add(slab);
    this.group.name = `code-window-${mood}`;
    if ((mood === "angry" || mood === "boss") && opts.eyes !== false) {
      this.addEyes();
    }
  }

  private addEyes() {
    const a = kit(0.012);
    const eyes = new THREE.Group();
    const s = Math.min(1.4, this.w * 0.09);
    const headerH = (HEADER / this.canvas.height) * this.h;

    eyes.position.set(
      this.w / 2 - s * 1.5,
      this.h / 2 - headerH * 0.55,
      this.depth / 2 + 0.02,
    );
    for (const side of [-1, 1]) {
      a.ball(
        eyes,
        "#fffdf0",
        side * s * 0.42,
        0,
        0,
        s * 0.3,
        s * 0.24,
        s * 0.12,
      );

      const pupil = a.ball(
        eyes,
        INK,
        side * s * 0.38,
        -s * 0.03,
        s * 0.1,
        s * 0.12,
        s * 0.12,
        s * 0.05,
        false,
      );

      pupil.name = "pupil";

      const brow = a.box(
        eyes,
        INK,
        side * s * 0.42,
        s * 0.24,
        s * 0.12,
        s * 0.48,
        s * 0.1,
        s * 0.08,
      );

      brow.rotation.z = side * -0.45;
    }

    this.eyes = eyes;
    this.group.add(eyes);
  }

  /** Repaint the face (e.g. the crack overlay). */
  refresh() {
    this.texture.needsUpdate = true;
  }

  crack(seed = 1, u?: number, v?: number) {
    this.cracks++;
    paintCracks(
      this.canvas,
      seed + this.cracks * 31,
      u === undefined ? undefined : u * this.canvas.width,
      v === undefined ? undefined : (1 - v) * this.canvas.height,
    );
    this.refresh();
  }

  update(dt: number) {
    this.t += dt;
    if (this.eyes) {
      const blink = Math.sin(this.t * 0.9) > 0.985 ? 0.15 : 1;

      this.eyes.scale.y = blink;
    }

    if (this.rattle > 0) {
      nth(this.group.children, 0, "window group children").position.set(
        (Math.random() - 0.5) * 0.04 * this.rattle,
        (Math.random() - 0.5) * 0.04 * this.rattle,
        0,
      );
    }
  }

  /**
   * Break into jagged physical pieces that keep their bit of the code on their face.
   * The window's own group is removed; the pieces belong to the debris world.
   */
  shatter(
    debris: Debris,
    from: THREE.Vector3,
    power = 6,
    grid: [number, number] = [6, 4],
    seed = 7,
  ) {
    this.group.updateMatrixWorld(true);

    const [cols, rows] = grid;
    const r = rng(seed);
    const w = this.w;
    const h = this.h;
    const d = this.depth;
    const P = Array.from({ length: cols + 1 }, (_, i) =>
      Array.from({ length: rows + 1 }, (_, j): [number, number] => {
        const jx = i > 0 && i < cols ? (r() - 0.5) * 0.55 * (w / cols) : 0;
        const jy = j > 0 && j < rows ? (r() - 0.5) * 0.55 * (h / rows) : 0;

        return [-w / 2 + (i * w) / cols + jx, -h / 2 + (j * h) / rows + jy];
      }),
    );
    const corner = (i: number, j: number) =>
      nth(nth(P, i, "grid columns"), j, "grid rows");
    const jag = new Map<string, [number, number][]>();
    const edge = (
      a: [number, number],
      b: [number, number],
      key: string,
      inner: boolean,
    ) => {
      let pts = jag.get(key);

      if (!pts) {
        pts = [a];
        if (inner) {
          for (let k = 1; k <= 2; k++) {
            const t = k / 3;
            const nx = -(b[1] - a[1]);
            const ny = b[0] - a[0];
            const len = Math.hypot(nx, ny) || 1;
            const off = (r() - 0.5) * 0.18 * len;

            pts.push([
              a[0] + (b[0] - a[0]) * t + (nx / len) * off,
              a[1] + (b[1] - a[1]) * t + (ny / len) * off,
            ]);
          }
        }

        pts.push(b);
        jag.set(key, pts);
      }

      return pts;
    };

    const H = (i: number, j: number) =>
      edge(corner(i, j), corner(i + 1, j), `h${i},${j}`, j > 0 && j < rows);
    const Vt = (i: number, j: number) =>
      edge(corner(i, j), corner(i, j + 1), `v${i},${j}`, i > 0 && i < cols);
    const refs = { n: 0 };

    this.face.userData.refs = 0;
    this.side.userData.refs = 0;

    const centre = new THREE.Vector3();

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const poly = [
          ...H(i, j).slice(0, -1),
          ...Vt(i + 1, j).slice(0, -1),
          ...[...H(i, j + 1)].reverse().slice(0, -1),
          ...[...Vt(i, j)].reverse().slice(0, -1),
        ];
        const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
        const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
        const shape = new THREE.Shape(
          poly.map(([x, y]) => new THREE.Vector2(x, y)),
        );
        const geo = extrudeMapped(shape, d, w, h, 0);

        geo.translate(-cx, -cy, 0);

        const mesh = new THREE.Mesh(geo, [this.face, this.side]);

        mesh.castShadow = true;
        mesh.position.set(cx, cy, 0);
        this.group.add(mesh);

        const hull = new Float32Array(poly.length * 6);

        for (const [k, [x, y]] of poly.entries()) {
          hull.set([x - cx, y - cy, d / 2], k * 6);
          hull.set([x - cx, y - cy, -d / 2], k * 6 + 3);
        }

        const world = mesh.getWorldPosition(centre);
        const away = world
          .clone()
          .sub(from)
          .normalize()
          .multiplyScalar(power * (0.5 + r() * 0.8));

        away.y += 2 + r() * 4;

        const spin = new THREE.Vector3(
          (r() - 0.5) * 9,
          (r() - 0.5) * 9,
          (r() - 0.5) * 9,
        );

        this.face.userData.refs++;
        this.side.userData.refs++;
        refs.n++;
        debris.add(
          mesh,
          hull,
          new THREE.Vector3(),
          away,
          spin,
          4.5 + r() * 2.5,
        );
      }
    }

    // The slab itself and the eyes go; eyes tumble as their own pieces.
    const slab = meshNamed(this.group, "code-slab");

    slab.geometry.dispose();
    slab.removeFromParent();
    if (this.eyes) {
      debris.breakObject(this.eyes, { from, power: power * 0.8 });
    }

    this.group.removeFromParent();
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.geometry.userData.shared) {
        o.geometry.dispose();
      }
    });
    if (!this.face.userData.refs) {
      this.texture.dispose();
      this.face.dispose();
      this.side.dispose();
    }

    this.group.removeFromParent();
  }
}
