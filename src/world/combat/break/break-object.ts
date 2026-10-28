import * as THREE from "three";
import { disposeTree } from "#root/src/world/models/toon.ts";
import { present } from "#root/src/nth.ts";
import { randomSpread } from "#root/src/world/world-shared.ts";
import type { Debris } from "#root/src/world/combat/physics.ts";

const BREAK_FROM_BELOW_Y = -0.5;
const BREAK_FROM_FRONT_Z = 1;
const SIZE_TO_HALF_EXTENT = 0.5;
const DEFAULT_BREAK_POWER = 5;
const BREAK_POWER_MIN = 0.6;
const BREAK_POWER_RANGE = 0.8;
const DEFAULT_BREAK_UP = 4;
const BREAK_UP_MIN = 0.5;
const DEFAULT_BREAK_SPIN = 8;
const DEFAULT_BREAK_LIFE = 5;

export interface BreakOptions {
  /** Where the blow came from; pieces fly away from it. */
  from?: THREE.Vector3;
  power?: number;
  life?: number;
  spin?: number;
  up?: number;
}

function meshesOf(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];

  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.outline) {
      meshes.push(o);
    }
  });

  return meshes;
}

/** Break a model into its parts: every mesh flies off as its own body with a box collider. */
export function breakObject(
  debris: Pick<Debris, "add">,
  root: THREE.Object3D,
  opts: BreakOptions = {},
) {
  root.updateMatrixWorld(true);

  const centre = new THREE.Box3()
    .setFromObject(root)
    .getCenter(new THREE.Vector3());
  const from =
    opts.from ??
    centre
      .clone()
      .add(new THREE.Vector3(0, BREAK_FROM_BELOW_Y, BREAK_FROM_FRONT_Z));

  for (const m of meshesOf(root)) {
    if (!m.geometry.boundingBox) {
      m.geometry.computeBoundingBox();
    }

    const bb = present(m.geometry.boundingBox, "the mesh bounding box");
    const half = bb
      .getSize(new THREE.Vector3())
      .multiplyScalar(SIZE_TO_HALF_EXTENT);
    const at = m.getWorldPosition(new THREE.Vector3());
    const dir = at.clone().sub(from).normalize();
    const power =
      (opts.power ?? DEFAULT_BREAK_POWER) *
      (BREAK_POWER_MIN + Math.random() * BREAK_POWER_RANGE);
    const velocity = dir
      .multiplyScalar(power)
      .add(
        new THREE.Vector3(
          0,
          (opts.up ?? DEFAULT_BREAK_UP) * (BREAK_UP_MIN + Math.random()),
          0,
        ),
      );

    debris.add({
      object: m,
      hull: null,
      half,
      velocity,
      spin: randomSpread(opts.spin ?? DEFAULT_BREAK_SPIN),
      life: opts.life ?? DEFAULT_BREAK_LIFE,
      offset: bb.getCenter(new THREE.Vector3()),
    });
  }

  disposeTree(root);
}
