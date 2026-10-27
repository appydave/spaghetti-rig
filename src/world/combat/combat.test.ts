import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { Combat } from "#root/src/world/combat/combat.ts";
import type { CombatDeps } from "#root/src/world/combat/shot-effects.ts";
import { Enemy } from "#root/src/world/models/enemies.ts";

const CAMERA_Z = 10;
const NEAR_Z = 0;
const FAR_Z = -10;
const ENEMY_SPEED = 1;
const SEED_NEAR = 1;
const SEED_FAR = 2;
const CENTRE = new THREE.Vector2(0, 0);

/** A combat with two enemies standing on one line from the camera: the near one first or the far one first in the list. */
function twoOnOneRay(farFirst: boolean) {
  const camera = new THREE.PerspectiveCamera();

  camera.position.set(0, 0, CAMERA_Z);
  camera.updateMatrixWorld();

  // Only what the pointer path reads: no shot is fired, so the rest of the deps stays unused.
  const deps = { player: "p1", camera, boss: () => null } as CombatDeps;
  const combat = new Combat(deps);
  const at = (z: number) => new THREE.Vector3(0, 0, z);
  const near = new Enemy("bug", SEED_NEAR, at(NEAR_Z), at(NEAR_Z), ENEMY_SPEED);
  const far = new Enemy("bug", SEED_FAR, at(FAR_Z), at(FAR_Z), ENEMY_SPEED);

  // The bug's hit sphere is centred above its feet; put the line through both centres.
  camera.position.y = near.centerY;
  camera.updateMatrixWorld();
  far.group.position.y = near.group.position.y;
  combat.enemies = farFirst ? [far, near] : [near, far];

  return { combat, near, far };
}

describe("Combat pick", () => {
  it.each([false, true])(
    "aims at the nearer of two enemies on one ray (far one first in the list: %s)",
    (farFirst) => {
      const { combat, near } = twoOnOneRay(farFirst);

      expect(combat.pointer(CENTRE, false)).toBe(true);
      // The ray enters the near enemy's sphere in front of its centre, closer to the camera than the far one's.
      expect(combat.aim?.z).toBeGreaterThan(near.group.position.z);
    },
  );
});
