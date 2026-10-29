import * as THREE from "three";
import { breakObject } from "#root/src/world/combat/break/break-object.ts";
import { Debris } from "#root/src/world/combat/physics.ts";
import {
  extrudeMapped,
  type Size,
} from "#root/src/world/code-window/glass/slab.ts";
import { nth } from "#root/src/nth.ts";
import { meshNamed } from "#root/src/world/models/objects.ts";
import { rng } from "#root/src/maths.ts";
import { RANDOM_CENTRE } from "#root/src/world/random-spread.ts";

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

type Point = [number, number];

/** The parts of a window that shattering needs. */
export interface Shatterable extends Size {
  group: THREE.Group;
  face: THREE.MeshBasicMaterial;
  side: THREE.MeshToonMaterial;
  depth: number;
  eyes?: THREE.Group;
}
export interface ShatterOptions {
  power?: number;
  grid?: [number, number];
  seed?: number;
}
/** The push every piece gets: where it comes from, how hard, and the dice. */
interface Blast {
  from: THREE.Vector3;
  power: number;
  r: () => number;
}

/** The grid of corners over the window; inner corners are jittered. */
function jitteredCorners(size: Size, grid: Point, r: () => number) {
  const [cols, rows] = grid;

  return Array.from({ length: cols + 1 }, (_, i) =>
    Array.from({ length: rows + 1 }, (_, j): Point => {
      const jx =
        i > 0 && i < cols
          ? (r() - RANDOM_CENTRE) * CORNER_JITTER_SHARE * (size.w / cols)
          : 0;
      const jy =
        j > 0 && j < rows
          ? (r() - RANDOM_CENTRE) * CORNER_JITTER_SHARE * (size.h / rows)
          : 0;

      return [
        -size.w / 2 + (i * size.w) / cols + jx,
        -size.h / 2 + (j * size.h) / rows + jy,
      ];
    }),
  );
}

/** An edge between two corners: straight on the border, bowed (split in parts) inside. */
function edgePoints(a: Point, b: Point, inner: boolean, r: () => number) {
  const pts = [a];

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

  return pts;
}

/** The outline of every piece: neighbouring pieces share one jagged edge, made the first time it is asked for. */
function pieceOutline(size: Size, grid: Point, r: () => number) {
  const [cols, rows] = grid;
  const corners = jitteredCorners(size, grid, r);
  const corner = (i: number, j: number) =>
    nth(nth(corners, i, "grid columns"), j, "grid rows");
  const jag = new Map<string, Point[]>();
  const edge = (key: string, a: Point, b: Point, inner: boolean) => {
    const known = jag.get(key);

    if (known) {
      return known;
    }

    const made = edgePoints(a, b, inner, r);

    jag.set(key, made);

    return made;
  };

  const H = (i: number, j: number) =>
    edge(`h${i},${j}`, corner(i, j), corner(i + 1, j), j > 0 && j < rows);
  const Vt = (i: number, j: number) =>
    edge(`v${i},${j}`, corner(i, j), corner(i, j + 1), i > 0 && i < cols);

  return (i: number, j: number): Point[] => [
    ...H(i, j).slice(0, -1),
    ...Vt(i + 1, j).slice(0, -1),
    ...[...H(i, j + 1)].reverse().slice(0, -1),
    ...[...Vt(i, j)].reverse().slice(0, -1),
  ];
}

/** The collision hull of a piece: its outline at the front, then at the back. */
function hullOf(poly: Point[], centre: Point, d: number) {
  const hull = new Float32Array(poly.length * HULL_STRIDE);

  for (const [k, [x, y]] of poly.entries()) {
    hull.set([x - centre[0], y - centre[1], d / 2], k * HULL_STRIDE);
    hull.set(
      [x - centre[0], y - centre[1], -d / 2],
      k * HULL_STRIDE + HULL_BACK,
    );
  }

  return hull;
}

/** One piece of glass, added to the window's group and thrown into the debris world. */
function throwPiece(
  win: Shatterable,
  debris: Debris,
  poly: Point[],
  blast: Blast,
) {
  const { r } = blast;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = extrudeMapped(shape, win.depth, win, 0);

  geo.translate(-cx, -cy, 0);

  const mesh = new THREE.Mesh(geo, [win.face, win.side]);

  mesh.castShadow = true;
  mesh.position.set(cx, cy, 0);
  win.group.add(mesh);

  const hull = hullOf(poly, [cx, cy], win.depth);
  const away = mesh
    .getWorldPosition(new THREE.Vector3())
    .sub(blast.from)
    .normalize()
    .multiplyScalar(blast.power * (SHARD_PUSH_MIN + r() * SHARD_PUSH_SPREAD));

  away.y += 2 + r() * SHARD_HOP_SPREAD;

  const spin = new THREE.Vector3(
    (r() - RANDOM_CENTRE) * SHARD_SPIN,
    (r() - RANDOM_CENTRE) * SHARD_SPIN,
    (r() - RANDOM_CENTRE) * SHARD_SPIN,
  );

  win.face.userData.refs++;
  win.side.userData.refs++;
  debris.add({
    object: mesh,
    hull,
    half: new THREE.Vector3(),
    velocity: away,
    spin,
    life: SHARD_LIFE_MIN + r() * SHARD_LIFE_SPREAD,
  });
}

/**
 * Break a window into jagged physical pieces that keep their bit of the code on their face.
 * The window's own group is removed; the pieces belong to the debris world.
 */
export function shatterWindow(
  win: Shatterable,
  debris: Debris,
  from: THREE.Vector3,
  {
    power = SHATTER_POWER,
    grid = [SHATTER_COLUMNS, SHATTER_ROWS],
    seed = SHATTER_SEED,
  }: ShatterOptions,
) {
  const r = rng(seed);
  const outline = pieceOutline(win, grid, r);

  win.group.updateMatrixWorld(true);
  win.face.userData.refs = 0;
  win.side.userData.refs = 0;

  for (let i = 0; i < grid[0]; i++) {
    for (let j = 0; j < grid[1]; j++) {
      throwPiece(win, debris, outline(i, j), { from, power, r });
    }
  }

  // The slab itself and the eyes go; eyes tumble as their own pieces.
  const slab = meshNamed(win.group, "code-slab");

  slab.geometry.dispose();
  slab.removeFromParent();
  if (win.eyes) {
    breakObject(debris, win.eyes, { from, power: power * EYE_PUSH_SHARE });
  }

  win.group.removeFromParent();
}
