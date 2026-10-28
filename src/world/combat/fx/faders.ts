// The effects that fade out on their own: rings and tracers, and the stepping and disposal every fader shares. Moved out of effects.ts.
import * as THREE from "three";
import { isDrawable, mapOf } from "#root/src/world/models/objects.ts";

/** One object that plays out over its life: `tick` gets how far through it is (0 → 1), then it is removed and freed. */
export interface Fader {
  obj: THREE.Object3D;
  mat: THREE.Material & { opacity: number };
  age: number;
  life: number;
  tick: (k: number, o: THREE.Object3D) => void;
}

/** How a ring looks: its colour, how far it grows, how long it lasts, and whether it lies flat or faces a point. */
export interface RingLook {
  color: string;
  size: number;
  life: number;
  flat?: boolean;
  face?: THREE.Vector3;
}

const TRACER_MIDPOINT = 0.5;
const RING_OPACITY = 0.9;
const RING_TUBE_RADIUS = 0.06;
const RING_TUBE_SEGMENTS = 6;
const RING_SEGMENTS = 40;
const RING_START_SCALE = 0.2;
const TRACER_TIP_TAPER = 0.4;
const TRACER_SEGMENTS = 6;
const TRACER_LIFE = 0.14;

/** A ring that grows and fades at a point. */
export function ringFader(
  scene: THREE.Scene,
  at: THREE.Vector3,
  look: RingLook,
): Fader {
  const { color, size, life, flat = false, face } = look;
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: RING_OPACITY,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(
      1,
      RING_TUBE_RADIUS,
      RING_TUBE_SEGMENTS,
      RING_SEGMENTS,
    ),
    mat,
  );

  ring.position.copy(at);
  if (flat) {
    ring.rotation.x = Math.PI / 2;
  } else if (face) {
    ring.lookAt(face);
  }

  scene.add(ring);

  return {
    obj: ring,
    mat,
    age: 0,
    life,
    tick: (k, o) => {
      o.scale.setScalar(RING_START_SCALE + k * size);
      mat.opacity = RING_OPACITY * (1 - k);
    },
  };
}

/** A short-lived tapered beam from one point to another. */
export function tracerFader(
  scene: THREE.Scene,
  from: THREE.Vector3,
  to: THREE.Vector3,
  look: { color: string; width: number },
): Fader {
  const { color, width } = look;
  const len = from.distanceTo(to);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    toneMapped: false,
  });
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(
      width,
      width * TRACER_TIP_TAPER,
      len,
      TRACER_SEGMENTS,
      1,
      true,
    ),
    mat,
  );

  beam.position.copy(from).lerp(to, TRACER_MIDPOINT);
  beam.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    to.clone().sub(from).normalize(),
  );
  scene.add(beam);

  return {
    obj: beam,
    mat,
    age: 0,
    life: TRACER_LIFE,
    tick: (k) => {
      mat.opacity = 1 - k;
    },
  };
}

/** Take a finished fader out of the scene and free its geometry, its own texture and its material. */
function freeFader(f: Fader) {
  f.obj.removeFromParent();
  if (isDrawable(f.obj)) {
    f.obj.geometry.dispose();
  }

  const map = mapOf(f.mat);

  if (map && !map.userData.shared) {
    map.dispose();
  }

  f.mat.dispose();
}

/** Age every fader by dt and tick it; the finished ones leave the live list and are freed. */
export function stepFaders(faders: Fader[], dt: number) {
  // Iterate a snapshot: finished faders are spliced out of the live list inside the loop.
  const snapshot = faders.slice();

  for (const f of snapshot) {
    f.age += dt;

    const k = Math.min(1, f.age / f.life);

    f.tick(k, f.obj);
    if (k >= 1) {
      faders.splice(faders.indexOf(f), 1);
      freeFader(f);
    }
  }
}
