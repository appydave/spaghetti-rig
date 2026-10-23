import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const INK = "#173e35";

/** Five soft bands: cel-shaded, but gentle enough to keep the daylight toy look. */
let gradient: THREE.DataTexture | undefined;
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const tones = [96, 150, 196, 232, 255];
  const data = new Uint8Array(tones.length * 4);
  for (const [i, t] of tones.entries()) {
    data.set([t, t, t, 255], i * 4);
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
  emissiveIntensity = 0.6,
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
export function outlineMaterial(thickness = 0.022): THREE.ShaderMaterial {
  let m = outlineMaterials.get(thickness);
  if (m) return m;
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
  box: new RoundedBoxGeometry(1, 1, 1, 3, 0.16),
  softBox: new RoundedBoxGeometry(1, 1, 1, 4, 0.3),
  sphere: new THREE.SphereGeometry(1, 24, 16),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 20),
  cone: new THREE.ConeGeometry(1, 1, 20),
  torus: new THREE.TorusGeometry(1, 0.28, 10, 28),
};
for (const g of Object.values(geo)) g.userData.shared = true;

/** A small modelling kit: every part is a toon mesh with an ink outline, casting soft shadows. */
export function kit(outline = 0.022) {
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
      Math.max(0.001, a.distanceTo(b)),
      6,
      14,
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
    bevel = 0.01,
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
      curveSegments: 6,
    });
    return mesh(p, g, c, 0, 0, z, 1, 1, 1);
  }
  return { mesh, box, soft, ball, cyl, link, capsule, extrude };
}

/** Dispose an object's own (non-shared) geometries, materials and textures. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    const mats = m.material
      ? Array.isArray(m.material)
        ? m.material
        : [m.material]
      : [];
    for (const mat of mats) {
      if (mat.userData.shared) continue;
      if (typeof mat.userData.refs === "number" && --mat.userData.refs > 0)
        continue;
      for (const v of Object.values(mat))
        if (v instanceof THREE.Texture && !v.userData.shared) v.dispose();
      mat.dispose();
    }
  });
  root.removeFromParent();
}

/** Seeded random, so both players' streets are identical. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outBack: (t: number) => {
    const c1 = 1.70158,
      c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inCubic: (t: number) => t * t * t,
  outElastic: (t: number) =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : Math.pow(2, -10 * t) *
            Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) +
          1,
};
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
