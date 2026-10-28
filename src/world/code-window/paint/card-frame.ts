import type { Layout } from "#root/src/world/code-window/codelayout.ts";
import { HEADER } from "#root/src/world/code-window/paint/card-measure.ts";
import { MONO, roundRect } from "#root/src/world/code-window/paint/shapes.ts";
import {
  CARD,
  PALETTE,
  WINDOW_DOTS,
  type Mood,
} from "#root/src/world/palette.ts";

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

/** The card's canvas size. */
export interface CardBox {
  width: number;
  height: number;
}

/** Body with a bright inner edge (the slab's front lip). */
export function paintSlab(
  g: CanvasRenderingContext2D,
  size: CardBox,
  p: (typeof PALETTE)[Mood],
) {
  const { width, height } = size;

  g.fillStyle = p.body;
  roundRect(g, { x: 0, y: 0, w: width, h: height }, SLAB_RADIUS);
  g.fill();
  g.lineWidth = EDGE_WIDTH;
  g.strokeStyle = p.edge;
  roundRect(
    g,
    {
      x: EDGE_INSET,
      y: EDGE_INSET,
      w: width - EDGE_WIDTH,
      h: height - EDGE_WIDTH,
    },
    EDGE_RADIUS,
  );
  g.stroke();
}

/** The title bar: its fill, the three window dots and the file name. */
export function paintTitleBar(
  g: CanvasRenderingContext2D,
  width: number,
  layout: Layout,
  p: (typeof PALETTE)[Mood],
) {
  g.save();
  roundRect(
    g,
    {
      x: BAR_INSET,
      y: BAR_INSET,
      w: width - BAR_WIDTH_TRIM,
      h: HEADER - BAR_HEIGHT_TRIM,
    },
    BAR_RADIUS,
  );
  g.clip();
  g.fillStyle = p.header;
  g.fillRect(0, 0, width, HEADER + BAR_OVERHANG);
  g.restore();
  for (const [i, c] of WINDOW_DOTS.entries()) {
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

  paintFilename(g, layout);
}

function paintFilename(g: CanvasRenderingContext2D, layout: Layout) {
  g.font = `600 28px ${MONO}`;
  g.fillStyle = CARD.filename;
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
}
