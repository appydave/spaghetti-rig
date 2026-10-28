import { context2d } from "#root/src/dom.ts";
import { rng } from "#root/src/maths.ts";
import { CRACK } from "#root/src/world/palette.ts";
import { RANDOM_CENTRE } from "#root/src/world/world-shared.ts";

/** The crack's centre lands this share of the way in, plus up to the spread, unless it is given. */
const CRACK_ORIGIN_MIN = 0.3;
const CRACK_ORIGIN_SPREAD = 0.4;
/** A crack has this many arms, plus up to this many more. */
const MIN_CRACK_ARMS = 9;
const EXTRA_CRACK_ARMS = 5;
/** Cracks are drawn twice: a dark wide line, then a bright thin one. */
const SHADOW_WIDTH = 7;
const HIGHLIGHT_WIDTH = 3;
/** An arm starts up to this many radians off its even share of the circle. */
const ARM_ANGLE_JITTER = 0.5;
/** An arm is this share of the canvas long, plus up to the spread, in this many segments that each turn up to this far. */
const ARM_LENGTH_MIN = 0.25;
const ARM_LENGTH_SPREAD = 0.4;
const ARM_SEGMENTS = 7;
const ARM_WANDER = 0.7;
/** The ring of cross-cracks: distance from the centre (plus up to the spread), angle it spans, and how much longer the far end is. */
const CROSS_RADIUS_MIN = 50;
const CROSS_RADIUS_SPREAD = 90;
const CROSS_ANGLE = 0.5;
const CROSS_STRETCH = 1.1;
/** The white dot at the point of impact. */
const IMPACT_RADIUS = 14;

/** Where the cracks start, and how many arms they have. */
interface Spray {
  x: number;
  y: number;
  arms: number;
  reach: number;
}

/** One wandering arm of the crack. */
function strokeArm(
  g: CanvasRenderingContext2D,
  spray: Spray,
  rr: () => number,
  i: number,
) {
  let a = (i / spray.arms) * Math.PI * 2 + rr() * ARM_ANGLE_JITTER;
  let x = spray.x;
  let y = spray.y;
  const len = spray.reach * (ARM_LENGTH_MIN + rr() * ARM_LENGTH_SPREAD);

  g.beginPath();
  g.moveTo(x, y);
  for (let s = 0; s < ARM_SEGMENTS; s++) {
    a += (rr() - RANDOM_CENTRE) * ARM_WANDER;
    x += (Math.cos(a) * len) / ARM_SEGMENTS;
    y += (Math.sin(a) * len) / ARM_SEGMENTS;
    g.lineTo(x, y);
  }

  g.stroke();
}

/** One short cross-crack on the ring around the centre. */
function strokeCross(
  g: CanvasRenderingContext2D,
  spray: Spray,
  rr: () => number,
) {
  const a = rr() * Math.PI * 2;
  const d = CROSS_RADIUS_MIN + rr() * CROSS_RADIUS_SPREAD;

  g.beginPath();
  g.moveTo(spray.x + Math.cos(a) * d, spray.y + Math.sin(a) * d);
  g.lineTo(
    spray.x + Math.cos(a + CROSS_ANGLE) * d * CROSS_STRETCH,
    spray.y + Math.sin(a + CROSS_ANGLE) * d * CROSS_STRETCH,
  );
  g.stroke();
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
  const x = cx ?? cv.width * (CRACK_ORIGIN_MIN + r() * CRACK_ORIGIN_SPREAD);
  const y = cy ?? cv.height * (CRACK_ORIGIN_MIN + r() * CRACK_ORIGIN_SPREAD);
  const arms = MIN_CRACK_ARMS + Math.floor(r() * EXTRA_CRACK_ARMS);
  const spray = { x, y, arms, reach: Math.max(cv.width, cv.height) };

  for (const [w, c] of [
    [SHADOW_WIDTH, CRACK.shadow],
    [HIGHLIGHT_WIDTH, CRACK.highlight],
  ] as const) {
    const rr = rng(seed);

    g.strokeStyle = c;
    g.lineWidth = w;
    g.lineJoin = "round";
    for (let i = 0; i < arms; i++) {
      strokeArm(g, spray, rr, i);
    }

    // A ring of short cross-cracks.
    for (let i = 0; i < arms; i++) {
      strokeCross(g, spray, rr);
    }
  }

  g.fillStyle = CRACK.impactDot;
  g.beginPath();
  g.arc(x, y, IMPACT_RADIUS, 0, Math.PI * 2);
  g.fill();
}
