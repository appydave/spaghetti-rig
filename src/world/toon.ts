import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { isDrawable } from "./objects";

export const INK = "#173e35";

const TONE_SHADOW = 96;
const TONE_DIM = 150;
const TONE_MID = 196;
const TONE_LIGHT = 232;
const TONE_FULL = 255;
const TONE_STEPS = [TONE_SHADOW, TONE_DIM, TONE_MID, TONE_LIGHT, TONE_FULL];
const RGBA_CHANNELS = 4;
const OPAQUE_BYTE = 255;
const DEFAULT_EMISSIVE_INTENSITY = 0.6;
const DEFAULT_OUTLINE_THICKNESS = 0.022;
const BOX_SEGMENTS = 3;
const BOX_RADIUS = 0.16;
const SOFT_BOX_SEGMENTS = 4;
const SOFT_BOX_RADIUS = 0.3;
const SPHERE_WIDTH_SEGMENTS = 24;
const SPHERE_HEIGHT_SEGMENTS = 16;
const ROUND_SEGMENTS = 20;
const TORUS_TUBE_RADIUS = 0.28;
const TORUS_TUBE_SEGMENTS = 10;
const TORUS_RING_SEGMENTS = 28;
const MIN_CAPSULE_LENGTH = 0.001;
const CAPSULE_CAP_SEGMENTS = 6;
const CAPSULE_RADIAL_SEGMENTS = 14;
const DEFAULT_EXTRUDE_BEVEL = 0.01;
const EXTRUDE_CURVE_SEGMENTS = 6;
const XORSHIFT_LEFT_A = 13;
const XORSHIFT_RIGHT = 17;
const XORSHIFT_LEFT_B = 5;
const UINT32_RANGE = 4294967296;
const EASE_CUBIC_POWER = 3;
const EASE_IN_HALF_SCALE = 4;
const EASE_OUT_HALF_SLOPE = -2;
const ELASTIC_PERIOD_DIVISOR = 3;
const EASE_MIDPOINT = 0.5;
const ELASTIC_DECAY = -10;
const ELASTIC_FREQUENCY = 10;
const ELASTIC_PHASE = 0.75;
const OVERSHOOT = 1.70158;

/** Five soft bands: cel-shaded, but gentle enough to keep the daylight toy look. */
let gradient: THREE.DataTexture | undefined;

export function toonGradient(): THREE.DataTexture {
  if (gradient) {
    return gradient;
  }

  const tones = TONE_STEPS;
  const data = new Uint8Array(tones.length * RGBA_CHANNELS);

  for (const [i, t] of tones.entries()) {
    data.set([t, t, t, OPAQUE_BYTE], i * RGBA_CHANNELS);
  }

  gradient = new THREE.DataTexture(data, tones.length, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;

  return gradient;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

/** Shared toon material per colour. Never dispose these; they live for the whole show. */
export function toon(
  color: THREE.ColorRepresentation,
  emissive?: THREE.ColorRepresentation,
  emissiveIntensity = DEFAULT_EMISSIVE_INTENSITY,
): THREE.MeshToonMaterial {
  const emissiveKey =
    emissive === undefined ? "" : new THREE.Color(emissive).getHexString();
  const key = `${new THREE.Color(color).getHexString()}|${emissiveKey}|${emissiveIntensity}`;
  let m = cache.get(key);

  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
    if (emissive !== undefined) {
      m.emissive.set(emissive);
      m.emissiveIntensity = emissiveIntensity;
    }

    m.userData.shared = true;
    cache.set(key, m);
  }

  return m;
}

/** Ink outline via the inverted-hull trick: a back-face shell pushed out along normals. */
const outlineMaterials = new Map<number, THREE.ShaderMaterial>();

export function outlineMaterial(
  thickness = DEFAULT_OUTLINE_THICKNESS,
): THREE.ShaderMaterial {
  let m = outlineMaterials.get(thickness);

  if (m) {
    return m;
  }

  m = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(INK) },
      thickness: { value: thickness },
    },
    vertexShader: `
      uniform float thickness;
      void main() {
        vec3 n = normalize(normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec3 wn = normalize(mat3(modelMatrix) * n);
        world.xyz += wn * thickness;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `uniform vec3 color;
void main() {
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`,
    side: THREE.BackSide,
  });
  m.userData.shared = true;
  outlineMaterials.set(thickness, m);

  return m;
}

export const geo = {
  box: new RoundedBoxGeometry(1, 1, 1, BOX_SEGMENTS, BOX_RADIUS),
  softBox: new RoundedBoxGeometry(1, 1, 1, SOFT_BOX_SEGMENTS, SOFT_BOX_RADIUS),
  sphere: new THREE.SphereGeometry(
    1,
    SPHERE_WIDTH_SEGMENTS,
    SPHERE_HEIGHT_SEGMENTS,
  ),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, ROUND_SEGMENTS),
  cone: new THREE.ConeGeometry(1, 1, ROUND_SEGMENTS),
  torus: new THREE.TorusGeometry(
    1,
    TORUS_TUBE_RADIUS,
    TORUS_TUBE_SEGMENTS,
    TORUS_RING_SEGMENTS,
  ),
};
for (const g of Object.values(geo)) {
  g.userData.shared = true;
}

/** A small modelling kit: every part is a toon mesh with an ink outline, casting soft shadows. */
export function kit(outline = DEFAULT_OUTLINE_THICKNESS) {
  function mesh(
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
  }

  const box = (
    p: THREE.Object3D,
    c: THREE.ColorRepresentation,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    lined = true,
  ) => mesh(p, geo.box, c, x, y, z, sx, sy, sz, lined);
  const soft = (
    p: THREE.Object3D,
    c: THREE.ColorRepresentation,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    lined = true,
  ) => mesh(p, geo.softBox, c, x, y, z, sx, sy, sz, lined);
  const ball = (
    p: THREE.Object3D,
    c: THREE.ColorRepresentation,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy = sx,
    sz = sx,
    lined = true,
  ) => mesh(p, geo.sphere, c, x, y, z, sx, sy, sz, lined);
  const cyl = (
    p: THREE.Object3D,
    c: THREE.ColorRepresentation,
    x: number,
    y: number,
    z: number,
    r: number,
    len: number,
    lined = true,
  ) => mesh(p, geo.cylinder, c, x, y, z, r, len, r, lined);

  /** A limb from a to b. */
  function link(
    p: THREE.Object3D,
    c: THREE.ColorRepresentation,
    a: THREE.Vector3,
    b: THREE.Vector3,
    r: number,
    lined = true,
  ) {
    const m = cyl(
      p,
      c,
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      (a.z + b.z) / 2,
      r,
      a.distanceTo(b),
      lined,
    );

    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );

    return m;
  }

  /** Rounded capsule limb (cylinder with ball ends). */
  function capsule(
    p: THREE.Object3D,
    c: THREE.ColorRepresentation,
    a: THREE.Vector3,
    b: THREE.Vector3,
    r: number,
  ) {
    const g = new THREE.CapsuleGeometry(
      r,
      Math.max(MIN_CAPSULE_LENGTH, a.distanceTo(b)),
      CAPSULE_CAP_SEGMENTS,
      CAPSULE_RADIAL_SEGMENTS,
    );
    const m = mesh(
      p,
      g,
      c,
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      (a.z + b.z) / 2,
      1,
      1,
      1,
    );

    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );

    return m;
  }

  function extrude(
    p: THREE.Object3D,
    c: THREE.ColorRepresentation,
    pts: [number, number][],
    depth: number,
    z: number,
    bevel = DEFAULT_EXTRUDE_BEVEL,
  ) {
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
  }

  return { mesh, box, soft, ball, cyl, link, capsule, extrude };
}

/** Dispose an object's own (non-shared) geometries, materials and textures. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    if (!isDrawable(o)) {
      return;
    }

    if (!o.geometry.userData.shared) {
      o.geometry.dispose();
    }

    const mats = Array.isArray(o.material) ? o.material : [o.material];

    for (const mat of mats) {
      if (mat.userData.shared) {
        continue;
      }

      if (typeof mat.userData.refs === "number" && --mat.userData.refs > 0) {
        continue;
      }

      for (const v of Object.values(mat)) {
        if (v instanceof THREE.Texture && !v.userData.shared) {
          v.dispose();
        }
      }

      mat.dispose();
    }
  });
  root.removeFromParent();
}

/** Seeded random, so both players' streets are identical. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;

  return () => {
    s ^= s << XORSHIFT_LEFT_A;
    s >>>= 0;
    s ^= s >>> XORSHIFT_RIGHT;
    s ^= s << XORSHIFT_LEFT_B;
    s >>>= 0;

    return s / UINT32_RANGE;
  };
}

export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, EASE_CUBIC_POWER),
  inOutCubic: (t: number) =>
    t < EASE_MIDPOINT
      ? EASE_IN_HALF_SCALE * t * t * t
      : 1 - Math.pow(EASE_OUT_HALF_SLOPE * t + 2, EASE_CUBIC_POWER) / 2,
  outBack: (t: number) => {
    const c1 = OVERSHOOT;
    const c3 = c1 + 1;

    return 1 + c3 * Math.pow(t - 1, EASE_CUBIC_POWER) + c1 * Math.pow(t - 1, 2);
  },
  inCubic: (t: number) => t * t * t,
  outElastic: (t: number) =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : Math.pow(2, ELASTIC_DECAY * t) *
            Math.sin(
              (t * ELASTIC_FREQUENCY - ELASTIC_PHASE) *
                ((2 * Math.PI) / ELASTIC_PERIOD_DIVISOR),
            ) +
          1,
};
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
