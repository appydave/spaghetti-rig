/**
 * Where the boss's pieces go, in the boss's own units (centre of the main window at 0,0).
 * The part-windows stand in columns either side of the main window, never on it; the head sits on top.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface BossLayout {
  core: Rect;
  head: Rect;
  parts: Rect[];
  width: number;
  top: number;
  bottom: number;
}

const CORE_WIDTH = 6.4;
const CORE_HEIGHT = 4.6;

export const CORE = { w: CORE_WIDTH, h: CORE_HEIGHT };

const PART_W = 4.5;
const GAP = 0.4;
const HEAD_WIDTH = 4.4;
const HEAD_HEIGHT = 2.7;
/** The head sinks this far into the top edge of the main window. */
const HEAD_SINK = 0.15;
/** Columns stand this much taller than the main window. */
const COLUMN_EXTRA_HEIGHT = 1.6;
/** The height a part-window wants, and the most it may have. */
const PART_WANTED_HEIGHT = 2.75;
const PART_MAX_HEIGHT = 3.0;
/** The horns rise this far above the head. */
const HORN_HEIGHT = 0.9;

const HEAD = { w: HEAD_WIDTH, h: HEAD_HEIGHT };

export function bossLayout(n: number): BossLayout {
  const core: Rect = { x: 0, y: 0, w: CORE.w, h: CORE.h };
  const head: Rect = {
    x: 0,
    y: CORE.h / 2 + HEAD.h / 2 - HEAD_SINK,
    w: HEAD.w,
    h: HEAD.h,
  };
  // Left column takes the odd one out; parts alternate left, right so the order reads across.
  const left = Math.ceil(n / 2);
  const right = Math.floor(n / 2);
  const rows = Math.max(1, left);
  // Columns stand a little taller than the main window; with many parts, taller still, so no part gets too small to read.
  const span = Math.max(
    CORE.h + COLUMN_EXTRA_HEIGHT,
    rows * PART_WANTED_HEIGHT + (rows - 1) * GAP,
  );
  const ph = Math.min(PART_MAX_HEIGHT, (span - GAP * (rows - 1)) / rows);
  const parts: Rect[] = [];

  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    const inCol = side < 0 ? left : right;
    const colH = inCol * ph + (inCol - 1) * GAP;
    const y = colH / 2 - ph / 2 - row * (ph + GAP);

    parts.push({
      x: side * (CORE.w / 2 + GAP + PART_W / 2),
      y,
      w: PART_W,
      h: ph,
    });
  }

  const width = n ? CORE.w + 2 * (GAP + PART_W) : CORE.w;
  const top = head.y + head.h / 2 + HORN_HEIGHT;
  const bottom = Math.min(-CORE.h / 2, ...parts.map((p) => p.y - p.h / 2));

  return { core, head, parts, width, top, bottom };
}

export const overlaps = (a: Rect, b: Rect, margin = 0) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + margin &&
  Math.abs(a.y - b.y) < (a.h + b.h) / 2 + margin;
