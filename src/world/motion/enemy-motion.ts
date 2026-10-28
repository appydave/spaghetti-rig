// An enemy's per-frame behaviour (After-G04 A2a): how far along its path it is, the robot's think pause, the hop, the leg flutter, the
// arm swing, and facing the player. Moved out of enemies.ts as it was, as one function per kind. The numbers of each kind's animation
// are ENEMY_MOTION in enemies.ts (next to the parts they move), and this file holds none of them; the few that change when or whether
// something happens in play are named here.
import type * as THREE from "three";

/** How long a robot stops to think, halfway along, before it walks on: decides when it reaches the player. */
export const ROBOT_PAUSE_SECONDS = 2.5;

/** The share of its path at which a robot stops to think. */
const ROBOT_PAUSE_AT = 0.5;

/** The hit flash fades at this rate per second, and swells the enemy by this much while it lasts. */
const HIT_FLASH_DECAY = 5;
const FLASH_SCALE = 0.15;

/** What the robot's label says while it walks. */
const ARMORED = "ARMORED";

/** The three kinds of enemy; each moves its own way. */
export type EnemyKind = "spaghetti" | "bug" | "robot";

/** What the animation reads and moves on an enemy: the Enemy class is one. */
export interface Walker {
  readonly group: THREE.Object3D;
  readonly kind: EnemyKind;
  readonly from: THREE.Vector3;
  readonly to: THREE.Vector3;
  readonly speed: number;
  readonly parts: Record<string, THREE.Object3D>;
  age: number;
  flash: number;
  part(name: string): THREE.Object3D;
  drawLabel(state: string): void;
  thinking(t: number): string;
}

/** The numbers of each kind's animation: data only, read by stepEnemy. */
export interface EnemyMotion {
  spaghetti: {
    hopRate: number;
    hopHeight: number;
    squash: number;
    swayRate: number;
    swayAmount: number;
  };
  bug: { legRate: number; legSwing: number; bob: number };
  robot: {
    swingRate: number;
    swingPhase: number;
    swing: number;
    idleArm: number;
    idleRate: number;
    idleAmount: number;
    nodRate: number;
    nodAmount: number;
  };
}

/** Where an enemy is on its path at time t. */
interface Trip {
  t: number;
  pause: boolean;
  travelled: number;
  total: number;
}

/** Robots stop halfway to think (and generate spaghetti) before walking on; the others never stop. */
function tripOf(e: Walker): Trip {
  const t = e.age;
  const total = e.from.distanceTo(e.to);

  if (e.kind !== "robot") {
    return { t, pause: false, travelled: Math.min(total, t * e.speed), total };
  }

  const half = (total * ROBOT_PAUSE_AT) / e.speed;
  const pause = t > half && t < half + ROBOT_PAUSE_SECONDS;
  const moving = t < half ? t : Math.max(half, t - ROBOT_PAUSE_SECONDS);

  return { t, pause, travelled: Math.min(total, moving * e.speed), total };
}

function hop(e: Walker, m: EnemyMotion, trip: Trip) {
  const k = m.spaghetti;
  const h = Math.abs(Math.sin(trip.t * k.hopRate));

  e.group.position.y = h * k.hopHeight;
  e.part("body").scale.set(
    1 + (1 - h) * k.squash,
    1 - (1 - h) * k.squash,
    1 + (1 - h) * k.squash,
  );
  e.part("body").rotation.y = Math.sin(trip.t * k.swayRate) * k.swayAmount;
}

function flutter(e: Walker, m: EnemyMotion, trip: Trip) {
  const k = m.bug;

  for (const [name, leg] of Object.entries(e.parts)) {
    if (name.startsWith("leg")) {
      leg.rotation.y = Math.sin(trip.t * k.legRate + name.length) * k.legSwing;
    }
  }

  e.group.position.y = Math.abs(Math.sin(trip.t * k.legRate)) * k.bob;
}

/** Legs and arms swing while the robot walks; standing, its arms are raised and it generates. */
function swingLimbs(e: Walker, m: EnemyMotion, trip: Trip) {
  const k = m.robot;
  const walking = !trip.pause && trip.travelled < trip.total;

  for (const side of [-1, 1]) {
    const swing =
      Math.sin(trip.t * k.swingRate + side * k.swingPhase) * k.swing;

    e.part(`leg${side}`).rotation.x = walking ? swing : 0;
    e.part(`arm${side}`).rotation.x = walking
      ? -Math.sin(trip.t * k.swingRate + side * k.swingPhase) * k.swing
      : k.idleArm + Math.sin(trip.t * k.idleRate) * k.idleAmount;
  }
}

function march(e: Walker, m: EnemyMotion, trip: Trip) {
  const k = m.robot;

  swingLimbs(e, m, trip);
  e.part("head").rotation.z = trip.pause
    ? Math.sin(trip.t * k.nodRate) * k.nodAmount
    : 0;
  e.drawLabel(trip.pause ? e.thinking(trip.t) : ARMORED);
}

const MOVES = { spaghetti: hop, bug: flutter, robot: march };

/** One frame of an enemy: advance along its path, animate its kind, face the player, and swell while it flashes. */
export function stepEnemy(
  e: Walker,
  m: EnemyMotion,
  dt: number,
  facing: THREE.Vector3,
) {
  e.age += dt;
  e.flash = Math.max(0, e.flash - dt * HIT_FLASH_DECAY);

  const trip = tripOf(e);
  const dir = e.to.clone().sub(e.from).normalize();

  e.group.position.copy(e.from).addScaledVector(dir, trip.travelled);
  MOVES[e.kind](e, m, trip);

  // Face the player.
  const look = facing.clone();

  look.y = e.group.position.y;
  e.group.lookAt(look);
  e.group.scale.setScalar(1 + e.flash * FLASH_SCALE);
}
