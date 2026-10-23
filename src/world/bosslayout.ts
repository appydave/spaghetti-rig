/**
 * Where the boss's pieces go, in the boss's own units (centre of the main window at 0,0).
 * The part-windows stand in columns either side of the main window, never on it; the head sits on top.
 */
export interface Rect { x: number; y: number; w: number; h: number }
export interface BossLayout { core: Rect; head: Rect; parts: Rect[]; width: number; top: number; bottom: number }

export const CORE = { w: 6.4, h: 4.6 };
const PART_W = 4.5, GAP = 0.4, HEAD = { w: 4.4, h: 2.7 };

export function bossLayout(n: number): BossLayout {
  const core: Rect = { x: 0, y: 0, w: CORE.w, h: CORE.h };
  const head: Rect = { x: 0, y: CORE.h / 2 + HEAD.h / 2 - 0.15, w: HEAD.w, h: HEAD.h };
  // Left column takes the odd one out; parts alternate left, right so the order reads across.
  const left = Math.ceil(n / 2), right = Math.floor(n / 2), rows = Math.max(1, left);
  // Columns stand a little taller than the main window; with many parts, taller still, so no part gets too small to read.
  const span = Math.max(CORE.h + 1.6, rows * 2.75 + (rows - 1) * GAP);
  const ph = Math.min(3.0, (span - GAP * (rows - 1)) / rows);
  const parts: Rect[] = [];
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2), inCol = side < 0 ? left : right;
    const colH = inCol * ph + (inCol - 1) * GAP;
    const y = colH / 2 - ph / 2 - row * (ph + GAP);
    parts.push({ x: side * (CORE.w / 2 + GAP + PART_W / 2), y, w: PART_W, h: ph });
  }
  const width = n ? CORE.w + 2 * (GAP + PART_W) : CORE.w;
  const top = head.y + head.h / 2 + 0.9; // horns
  const bottom = Math.min(-CORE.h / 2, ...parts.map((p) => p.y - p.h / 2));
  return { core, head, parts, width, top, bottom };
}

export const overlaps = (a: Rect, b: Rect, margin = 0) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + margin && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + margin;
