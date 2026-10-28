// The modelling kit the model files build from: every part is a toon mesh with an ink outline, casting soft shadows. Moved out of
// models/toon.ts: kit() was one 139-line closure, now it assembles part functions made here. The part helpers take a position and a scale
// as separate numbers, like the hand-placed asset data that calls them (R14, option A: toon's kit is exempt from max-params by name).
import * as THREE from "three";
import {
  DEFAULT_OUTLINE_THICKNESS,
  geo,
  outlineMaterial,
  toon,
} from "#root/src/world/models/toon.ts";

const MIN_CAPSULE_LENGTH = 0.001;
const CAPSULE_CAP_SEGMENTS = 6;
const CAPSULE_RADIAL_SEGMENTS = 14;
const DEFAULT_EXTRUDE_BEVEL = 0.01;
const EXTRUDE_CURVE_SEGMENTS = 6;

type Mesh = ReturnType<typeof meshMaker>;

/** Lay a part along the segment a to b: its middle sits halfway between them and its long (y) axis points from a to b. */
function placeAlong(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize(),
  );
}

/** The kit's one mesh maker: a toon mesh placed and scaled, with an outline shell of the given thickness (none at 0). */
function meshMaker(outline: number) {
  return function mesh(
    parent: THREE.Object3D,
    g: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = sx,
    sz = sx,
    lined = true,
  ) {
    const m = new THREE.Mesh(g, toon(color));

    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    if (lined && outline > 0) {
      // The shader pushes the shell out in world units, so the line weight ignores the part's scale.
      const o = new THREE.Mesh(g, outlineMaterial(outline));

      o.userData.outline = true;
      o.castShadow = false;
      m.add(o);
    }

    parent.add(m);

    return m;
  };
}

/** A part that is one fixed shape, given a position and a scale: one for all three axes, or one per axis. */
const scaledPart =
  (mesh: Mesh, g: THREE.BufferGeometry) =>
  (
    p: THREE.Object3D,
    c: THREE.ColorRepresentation,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy = sx,
    sz = sx,
    lined = true,
  ) =>
    mesh(p, g, c, x, y, z, sx, sy, sz, lined);

/** An upright cylinder of a radius and a length. */
const cylPart =
  (mesh: Mesh) =>
  (
    p: THREE.Object3D,
    c: THREE.ColorRepresentation,
    x: number,
    y: number,
    z: number,
    r: number,
    len: number,
    lined = true,
  ) =>
    mesh(p, geo.cylinder, c, x, y, z, r, len, r, lined);

type Cyl = ReturnType<typeof cylPart>;

/** A limb from a to b. */
const linkPart =
  (cyl: Cyl) =>
  (
    p: THREE.Object3D,
    c: THREE.ColorRepresentation,
    a: THREE.Vector3,
    b: THREE.Vector3,
    r: number,
    lined = true,
  ) => {
    const m = cyl(p, c, 0, 0, 0, r, a.distanceTo(b), lined);

    placeAlong(m, a, b);

    return m;
  };

/** Rounded capsule limb (cylinder with ball ends). */
const capsulePart =
  (mesh: Mesh) =>
  (
    p: THREE.Object3D,
    c: THREE.ColorRepresentation,
    a: THREE.Vector3,
    b: THREE.Vector3,
    r: number,
  ) => {
    const g = new THREE.CapsuleGeometry(
      r,
      Math.max(MIN_CAPSULE_LENGTH, a.distanceTo(b)),
      CAPSULE_CAP_SEGMENTS,
      CAPSULE_RADIAL_SEGMENTS,
    );
    const m = mesh(p, g, c, 0, 0, 0, 1, 1, 1);

    placeAlong(m, a, b);

    return m;
  };

/** A flat outline (points in x, y) extruded to a depth, standing at z. */
const extrudePart =
  (mesh: Mesh) =>
  (
    p: THREE.Object3D,
    c: THREE.ColorRepresentation,
    pts: [number, number][],
    depth: number,
    z: number,
    bevel = DEFAULT_EXTRUDE_BEVEL,
  ) => {
    const shape = new THREE.Shape();

    for (const [i, [x, y]] of pts.entries()) {
      i ? shape.lineTo(x, y) : shape.moveTo(x, y);
    }

    shape.closePath();

    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: bevel > 0,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 2,
      curveSegments: EXTRUDE_CURVE_SEGMENTS,
    });

    return mesh(p, g, c, 0, 0, z, 1, 1, 1);
  };

/** A small modelling kit: every part is a toon mesh with an ink outline, casting soft shadows. */
export function kit(outline = DEFAULT_OUTLINE_THICKNESS) {
  const mesh = meshMaker(outline);
  const cyl = cylPart(mesh);

  return {
    mesh,
    box: scaledPart(mesh, geo.box),
    soft: scaledPart(mesh, geo.softBox),
    ball: scaledPart(mesh, geo.sphere),
    cyl,
    link: linkPart(cyl),
    capsule: capsulePart(mesh),
    extrude: extrudePart(mesh),
  };
}
