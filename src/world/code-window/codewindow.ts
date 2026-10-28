import * as THREE from "three";
import { breakObject } from "#root/src/world/combat/break/break-object.ts";
import { Debris } from "#root/src/world/combat/physics.ts";
import { INK, kit, rng, toon } from "#root/src/world/models/toon.ts";
import {
  CRACK,
  EYE_WHITE,
  PALETTE,
  SLAB_TOON,
  type Mood,
} from "#root/src/world/palette.ts";
import { HEADER } from "#root/src/world/code-window/paint/card-measure.ts";
import { meshNamed } from "#root/src/world/models/objects.ts";
import { context2d } from "#root/src/dom.ts";
import { nth } from "#root/src/nth.ts";
import { RANDOM_CENTRE } from "#root/src/world/world-shared.ts";

export { PALETTE } from "#root/src/world/palette.ts";
export type { Mood } from "#root/src/world/palette.ts";

/** A random 0..1 minus this is an offset either side of zero. */
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

/** Draw a spray of glass cracks from a point (canvas px). */
export function paintCracks(
  cv: HTMLCanvasElement,
  seed: number,
  cx?: number,
  cy?: number,
) {
  const g = context2d(cv);
  const r = rng(seed);
  const x0 = cx ?? cv.width * (CRACK_ORIGIN_MIN + r() * CRACK_ORIGIN_SPREAD);
  const y0 = cy ?? cv.height * (CRACK_ORIGIN_MIN + r() * CRACK_ORIGIN_SPREAD);
  const arms = MIN_CRACK_ARMS + Math.floor(r() * EXTRA_CRACK_ARMS);

  for (const [w, c] of [
    [SHADOW_WIDTH, CRACK.shadow],
    [HIGHLIGHT_WIDTH, CRACK.highlight],
  ] as const) {
    const rr = rng(seed);

    g.strokeStyle = c;
    g.lineWidth = w;
    g.lineJoin = "round";
    for (let i = 0; i < arms; i++) {
      let a = (i / arms) * Math.PI * 2 + rr() * ARM_ANGLE_JITTER;
      let x = x0;
      let y = y0;
      const len =
        Math.max(cv.width, cv.height) *
        (ARM_LENGTH_MIN + rr() * ARM_LENGTH_SPREAD);

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

    // A ring of short cross-cracks.
    for (let i = 0; i < arms; i++) {
      const a = rr() * Math.PI * 2;
      const d = CROSS_RADIUS_MIN + rr() * CROSS_RADIUS_SPREAD;

      g.beginPath();
      g.moveTo(x0 + Math.cos(a) * d, y0 + Math.sin(a) * d);
      g.lineTo(
        x0 + Math.cos(a + CROSS_ANGLE) * d * CROSS_STRETCH,
        y0 + Math.sin(a + CROSS_ANGLE) * d * CROSS_STRETCH,
      );
      g.stroke();
    }
  }

  g.fillStyle = CRACK.impactDot;
  g.beginPath();
  g.arc(x0, y0, IMPACT_RADIUS, 0, Math.PI * 2);
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

/** How finely the slab's rounded corners are cut. */
const CURVE_SEGMENTS = 5;
/** A texture coordinate is a position over the window's size, plus this to move the centre to the middle of the 0..1 range. */
const UV_CENTRE = 0.5;

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
    curveSegments: CURVE_SEGMENTS,
    steps: 1,
  });

  geo.translate(0, 0, -depth / 2);

  const pos = geo.getAttribute("position");
  const uv = geo.getAttribute("uv");
  const caps = nth(geo.groups, 0, "geometry groups");

  for (let i = caps.start; i < caps.start + caps.count; i++) {
    uv.setXY(i, pos.getX(i) / w + UV_CENTRE, pos.getY(i) / h + UV_CENTRE);
  }

  uv.needsUpdate = true;

  return geo;
}

/** The blink clock starts at a random time up to this many seconds in, so windows do not blink together. */
const BLINK_PHASE_RANGE = 10;
/** The slab is at least this thick, or this share of its width; its corners are this share of its shorter side; its bevel is this big. */
const MIN_DEPTH = 0.16;
const DEPTH_SHARE = 0.04;
const CORNER_SHARE = 0.035;
const SLAB_BEVEL = 0.02;
/** The eyes: outline thickness, largest size, share of the window width, how many sizes in from the right edge, how far down the header. */
const EYE_OUTLINE = 0.012;
const MAX_EYE_SIZE = 1.4;
const EYE_SIZE_SHARE = 0.09;
const EYE_EDGE_INSET = 1.5;
const EYE_HEADER_SHARE = 0.55;
/** The eyes float this far in front of the slab. */
const EYE_LIFT = 0.02;
/** Each eye's parts, as shares of the eye size. White: sideways offset (the brow shares it), width, height, depth. */
const EYE_SPACING = 0.42;
const WHITE_WIDTH = 0.3;
const WHITE_HEIGHT = 0.24;
const WHITE_DEPTH = 0.12;
/** Pupil: sideways offset, drop, forward offset, width, height, depth. */
const PUPIL_SPACING = 0.38;
const PUPIL_DROP = 0.03;
const PUPIL_FORWARD = 0.1;
const PUPIL_WIDTH = 0.12;
const PUPIL_HEIGHT = 0.12;
const PUPIL_DEPTH = 0.05;
/** Brow: height above the eye, forward offset, length, thickness, depth, and its angry tilt in radians. */
const BROW_RAISE = 0.24;
const BROW_FORWARD = 0.12;
const BROW_LENGTH = 0.48;
const BROW_THICKNESS = 0.1;
const BROW_DEPTH = 0.08;
const BROW_TILT = 0.45;
/** Each crack adds this to the seed so no two cracks on a window match. */
const CRACK_SEED_STEP = 31;
/** The blink: how fast its clock runs, how high the sine must reach to blink, and how squashed the eyes get. */
const BLINK_RATE = 0.9;
const BLINK_THRESHOLD = 0.985;
const BLINK_SQUASH = 0.15;
/** A rattling window shakes up to this far (scaled by its rattle). */
const RATTLE_RANGE = 0.04;
/** Shattering: the default push, the default grid (columns, rows) and the default seed. */
const SHATTER_POWER = 6;
const SHATTER_COLUMNS = 6;
const SHATTER_ROWS = 4;
const SHATTER_SEED = 7;
/** Inner grid corners move up to this share of a cell; an inner edge is split in this many parts and bowed up to this share of its length. */
const CORNER_JITTER_SHARE = 0.55;
const EDGE_SPLITS = 3;
const EDGE_BOW_SHARE = 0.18;
/** A piece's collision hull is 6 numbers per outline point: the front corner, then the back corner 3 numbers on. */
const HULL_STRIDE = 6;
const HULL_BACK = HULL_STRIDE / 2;
/** A piece flies off with this share of the push, plus up to the spread; it also hops up by a base plus up to the spread. */
const SHARD_PUSH_MIN = 0.5;
const SHARD_PUSH_SPREAD = 0.8;
const SHARD_HOP_SPREAD = 4;
/** A piece tumbles up to this fast either way, and lives this long plus up to the spread. */
const SHARD_SPIN = 9;
const SHARD_LIFE_MIN = 4.5;
const SHARD_LIFE_SPREAD = 2.5;
/** The eyes are thrown with this share of the push. */
const EYE_PUSH_SHARE = 0.8;

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
  private t = Math.random() * BLINK_PHASE_RANGE;
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
    this.depth = opts.depth ?? Math.max(MIN_DEPTH, w * DEPTH_SHARE);
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.face = new THREE.MeshBasicMaterial({
      map: this.texture,
      toneMapped: false,
    });
    this.side = new THREE.MeshToonMaterial({
      color: PALETTE[mood].side,
      gradientMap: toon(SLAB_TOON).gradientMap,
    });

    const geo = extrudeMapped(
      slabShape(w, h, Math.min(w, h) * CORNER_SHARE),
      this.depth,
      w,
      h,
      SLAB_BEVEL,
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
    const a = kit(EYE_OUTLINE);
    const eyes = new THREE.Group();
    const s = Math.min(MAX_EYE_SIZE, this.w * EYE_SIZE_SHARE);
    const headerH = (HEADER / this.canvas.height) * this.h;

    eyes.position.set(
      this.w / 2 - s * EYE_EDGE_INSET,
      this.h / 2 - headerH * EYE_HEADER_SHARE,
      this.depth / 2 + EYE_LIFT,
    );
    for (const side of [-1, 1]) {
      a.ball(
        eyes,
        EYE_WHITE,
        side * s * EYE_SPACING,
        0,
        0,
        s * WHITE_WIDTH,
        s * WHITE_HEIGHT,
        s * WHITE_DEPTH,
      );

      const pupil = a.ball(
        eyes,
        INK,
        side * s * PUPIL_SPACING,
        -s * PUPIL_DROP,
        s * PUPIL_FORWARD,
        s * PUPIL_WIDTH,
        s * PUPIL_HEIGHT,
        s * PUPIL_DEPTH,
        false,
      );

      pupil.name = "pupil";

      const brow = a.box(
        eyes,
        INK,
        side * s * EYE_SPACING,
        s * BROW_RAISE,
        s * BROW_FORWARD,
        s * BROW_LENGTH,
        s * BROW_THICKNESS,
        s * BROW_DEPTH,
      );

      brow.rotation.z = side * -BROW_TILT;
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
      seed + this.cracks * CRACK_SEED_STEP,
      u === undefined ? undefined : u * this.canvas.width,
      v === undefined ? undefined : (1 - v) * this.canvas.height,
    );
    this.refresh();
  }

  update(dt: number) {
    this.t += dt;
    if (this.eyes) {
      const blink =
        Math.sin(this.t * BLINK_RATE) > BLINK_THRESHOLD ? BLINK_SQUASH : 1;

      this.eyes.scale.y = blink;
    }

    if (this.rattle > 0) {
      nth(this.group.children, 0, "window group children").position.set(
        (Math.random() - RANDOM_CENTRE) * RATTLE_RANGE * this.rattle,
        (Math.random() - RANDOM_CENTRE) * RATTLE_RANGE * this.rattle,
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
    power = SHATTER_POWER,
    grid: [number, number] = [SHATTER_COLUMNS, SHATTER_ROWS],
    seed = SHATTER_SEED,
  ) {
    this.group.updateMatrixWorld(true);

    const [cols, rows] = grid;
    const r = rng(seed);
    const w = this.w;
    const h = this.h;
    const d = this.depth;
    const P = Array.from({ length: cols + 1 }, (_, i) =>
      Array.from({ length: rows + 1 }, (_, j): [number, number] => {
        const jx =
          i > 0 && i < cols
            ? (r() - RANDOM_CENTRE) * CORNER_JITTER_SHARE * (w / cols)
            : 0;
        const jy =
          j > 0 && j < rows
            ? (r() - RANDOM_CENTRE) * CORNER_JITTER_SHARE * (h / rows)
            : 0;

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
            const t = k / EDGE_SPLITS;
            const nx = -(b[1] - a[1]);
            const ny = b[0] - a[0];
            const len = Math.hypot(nx, ny) || 1;
            const off = (r() - RANDOM_CENTRE) * EDGE_BOW_SHARE * len;

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

        const hull = new Float32Array(poly.length * HULL_STRIDE);

        for (const [k, [x, y]] of poly.entries()) {
          hull.set([x - cx, y - cy, d / 2], k * HULL_STRIDE);
          hull.set([x - cx, y - cy, -d / 2], k * HULL_STRIDE + HULL_BACK);
        }

        const world = mesh.getWorldPosition(centre);
        const away = world
          .clone()
          .sub(from)
          .normalize()
          .multiplyScalar(power * (SHARD_PUSH_MIN + r() * SHARD_PUSH_SPREAD));

        away.y += 2 + r() * SHARD_HOP_SPREAD;

        const spin = new THREE.Vector3(
          (r() - RANDOM_CENTRE) * SHARD_SPIN,
          (r() - RANDOM_CENTRE) * SHARD_SPIN,
          (r() - RANDOM_CENTRE) * SHARD_SPIN,
        );

        this.face.userData.refs++;
        this.side.userData.refs++;
        refs.n++;
        debris.add({
          object: mesh,
          hull,
          half: new THREE.Vector3(),
          velocity: away,
          spin,
          life: SHARD_LIFE_MIN + r() * SHARD_LIFE_SPREAD,
        });
      }
    }

    // The slab itself and the eyes go; eyes tumble as their own pieces.
    const slab = meshNamed(this.group, "code-slab");

    slab.geometry.dispose();
    slab.removeFromParent();
    if (this.eyes) {
      breakObject(debris, this.eyes, { from, power: power * EYE_PUSH_SHARE });
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
