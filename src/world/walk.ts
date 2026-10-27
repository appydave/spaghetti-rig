// The walk down the road (G04 W6): where it goes, how far along it is, and the enemies that run at the player on the way. The Director drives
// the walk, so both players stay in lockstep; the world keeps the walk it is on and these move it. Moved out of world.ts as it was.
import * as THREE from "three";
import type { Step } from "#root/src/show/script.ts";
import { Enemy, type EnemyKind } from "#root/src/world/models/enemies.ts";
import type { StepContext } from "#root/src/world/step-context.ts";
import { ease, lerp, rng } from "#root/src/world/models/toon.ts";
import { standZ } from "#root/src/world/world-shared.ts";

const WALK_SEED_BASE = 500;
const WALK_SEED_PER_TIER = 31;
const WALK_SEED_PER_STOP = 7;
const SPAWNS_MIN = 7;
const SPAWNS_SPREAD = 3;
const SPAWN_FIRST_AT = 0.04;
const SPAWN_SPAN = 0.72;
const SPAWN_JITTER = 0.05;
const SPAGHETTI_CHANCE_UP_TO = 0.45;
const BUG_CHANCE_UP_TO = 0.75;
const SPAWN_SEED_RANGE = 1e6;
const WALK_EASED_SHARE = 0.15;
const WALK_LINEAR_SHARE = 0.85;
const SPAWN_DISTANCE_AHEAD = 18;
const SPAWN_DISTANCE_JITTER = 8;
const COIN_FLIP = 0.5;
const SPAGHETTI_START_X = 3;
const SPAGHETTI_END_X = 1.5;
const SPAGHETTI_TRAVEL_Z = 10;
const SPAGHETTI_SPEED = 2.2;
const BUG_LANE_X = 5;
const BUG_TRAVEL_Z = 4;
const BUG_SPEED = 3.2;
const ROBOT_LANE_X = 9;
const ROBOT_START_BACK = 4;
const ROBOT_TRAVEL_Z = 2;
const ROBOT_SPEED = 2.6;

type Spawn = { at: number; kind: EnemyKind; seed: number };

/** A walk along the road: from and to (z), how far along (u: 0 to 1), the enemies still to come and which is next. */
export type Walk = {
  from: number;
  to: number;
  u: number;
  spawns: Spawn[];
  next: number;
};

/** Plan a walk for a step and set the character walking. */
export function startWalk(c: StepContext, step: Step): Walk {
  const tier = c.street.playing;
  const to =
    step.stop < tier.stops.length
      ? standZ(step.stop)
      : standZ(tier.stops.length);
  const from = c.character.root.position.z;
  const r = rng(
    WALK_SEED_BASE +
      step.tier * WALK_SEED_PER_TIER +
      step.stop * WALK_SEED_PER_STOP,
  );
  const spawns: Spawn[] = [];
  const count = SPAWNS_MIN + Math.floor(r() * SPAWNS_SPREAD);

  for (let i = 0; i < count; i++) {
    const roll = r();

    spawns.push({
      at: SPAWN_FIRST_AT + (i / count) * SPAWN_SPAN + r() * SPAWN_JITTER,
      kind:
        roll < SPAGHETTI_CHANCE_UP_TO
          ? "spaghetti"
          : roll < BUG_CHANCE_UP_TO
            ? "bug"
            : "robot",
      seed: Math.floor(r() * SPAWN_SEED_RANGE),
    });
  }

  c.character.pose = "walk";

  return { from, to, u: 0, spawns, next: 0 };
}

/** Move the walk to u and send out the enemies it has reached. */
export function advanceWalk(c: StepContext, w: Walk, u: number) {
  w.u = u;
  c.character.root.position.z = lerp(
    w.from,
    w.to,
    ease.inOutCubic(u) * WALK_EASED_SHARE + u * WALK_LINEAR_SHARE,
  );
  for (;;) {
    const next = w.spawns[w.next];

    if (!next || next.at > u) {
      break;
    }

    w.next++;
    spawn(c, next);
  }

  if (u >= 1) {
    c.character.pose = "idle";
  }
}

function spawn(c: StepContext, sp: { kind: EnemyKind; seed: number }) {
  const r = rng(sp.seed);
  const z0 =
    c.character.root.position.z -
    SPAWN_DISTANCE_AHEAD -
    r() * SPAWN_DISTANCE_JITTER;
  const side = r() < COIN_FLIP ? -1 : 1;
  let from: THREE.Vector3;
  let to: THREE.Vector3;
  let speed: number;

  if (sp.kind === "spaghetti") {
    from = new THREE.Vector3(side * SPAGHETTI_START_X, 0, z0);
    to = new THREE.Vector3(-side * SPAGHETTI_END_X, 0, z0 + SPAGHETTI_TRAVEL_Z);
    speed = SPAGHETTI_SPEED;
  } else if (sp.kind === "bug") {
    from = new THREE.Vector3(side * BUG_LANE_X, 0, z0);
    to = new THREE.Vector3(-side * BUG_LANE_X, 0, z0 + BUG_TRAVEL_Z);
    speed = BUG_SPEED;
  } else {
    from = new THREE.Vector3(side * ROBOT_LANE_X, 0, z0 - ROBOT_START_BACK);
    to = new THREE.Vector3(-side * ROBOT_LANE_X, 0, z0 + ROBOT_TRAVEL_Z);
    speed = ROBOT_SPEED;
  }

  const e = new Enemy(sp.kind, sp.seed, from, to, speed);

  c.combat.enemies.push(e);
  c.scene.add(e.group);
}
