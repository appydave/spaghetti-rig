import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { isDrawable } from "#root/src/world/models/objects.ts";
import { INK } from "#root/src/world/palette.ts";

const TONE_SHADOW = 96;
const TONE_DIM = 150;
const TONE_MID = 196;
const TONE_LIGHT = 232;
const TONE_FULL = 255;
const TONE_STEPS = [TONE_SHADOW, TONE_DIM, TONE_MID, TONE_LIGHT, TONE_FULL];
const RGBA_CHANNELS = 4;
const OPAQUE_BYTE = 255;
const DEFAULT_EMISSIVE_INTENSITY = 0.6;
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

/** The kit's ink line weight, in world units. */
export const DEFAULT_OUTLINE_THICKNESS = 0.022;

/** Five soft bands: cel-shaded, but gentle enough to keep the daylight toy look. */
let gradient: THREE.DataTexture | undefined;

function toonGradient(): THREE.DataTexture {
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

/** Free a material unless it is shared or still has other users, with the textures it owns. */
function disposeMaterial(mat: THREE.Material) {
  if (mat.userData.shared) {
    return;
  }

  if (typeof mat.userData.refs === "number" && --mat.userData.refs > 0) {
    return;
  }

  for (const v of Object.values(mat)) {
    if (v instanceof THREE.Texture && !v.userData.shared) {
      v.dispose();
    }
  }

  mat.dispose();
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
      disposeMaterial(mat);
    }
  });
  root.removeFromParent();
}
