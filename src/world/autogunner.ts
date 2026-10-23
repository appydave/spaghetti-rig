import * as THREE from "three";
import { rng } from "./toon";

// The hand's feel. Times are in seconds, and the "spread" values are multiplied by a random 0..1 and added to the base.
const DEFAULT_MISS_CHANCE = 0.22;
const DEFAULT_BURST_CHANCE = 0.3;
const FIRST_SHOT_DELAY = 0.3;
const FIRST_SHOT_DELAY_SPREAD = 0.5;
/** With nothing to shoot, how fast the aim drifts back to the middle of the road, per second. */
const DRIFT_BACK_RATE = 1.5;
/** A new target: the reaction time before the first shot, and how fast the hand closes on it. */
const REACTION_DELAY = 0.18;
const REACTION_DELAY_SPREAD = 0.3;
const CLOSE_SPEED = 3.5;
const CLOSE_SPEED_SPREAD = 3.5;
/** A random 0..1 minus this is an offset either side of zero. */
const RANDOM_CENTRE = 0.5;
/** How far a steady aim trembles. */
const TREMBLE = 0.02;
/** The pause between shots in a burst, and how many extra shots a burst can have. */
const BURST_GAP = 0.07;
const BURST_GAP_SPREAD = 0.05;
const MAX_BURST_FOLLOW_UPS = 3;
/** The pause after a lone shot: mostly quick, sometimes a long look. */
const QUICK_PAUSE = 0.22;
const LONG_LOOK_SPREAD = 1.1;
/** Where a shot lands, in target radii from the centre: a miss lands beyond MISS_DISTANCE, a hit inside HIT_SPREAD. */
const MISS_DISTANCE = 1.5;
const MISS_DISTANCE_SPREAD = 0.9;
const HIT_SPREAD = 0.45;

export interface Target {
  id: number;
  centre: THREE.Vector3;
  radius: number;
}
export interface Shot {
  at: THREE.Vector3;
  target: Target;
}

/**
 * Autoplay's trigger finger, made to look like a person playing: the aim drifts onto a target
 * instead of snapping, the pause between shots varies, some shots are pulled wide, and now and
 * then it fires a short burst. Seeded, so each player has their own hand and tests can replay it.
 */
export class AutoGunner {
  aim: THREE.Vector3 | null = null;
  private readonly r: () => number;
  private wait: number;
  private burst = 0;
  private targetId = -1;
  /** Where on (or off) the target this shot is meant to land, relative to its centre. */
  private readonly error = new THREE.Vector3();
  /** How quickly the hand closes on the target, per second. */
  private speed: number;

  constructor(
    seed: number,
    readonly missChance = DEFAULT_MISS_CHANCE,
    readonly burstChance = DEFAULT_BURST_CHANCE,
  ) {
    this.r = rng(seed);
    this.wait = FIRST_SHOT_DELAY + this.r() * FIRST_SHOT_DELAY_SPREAD;
    this.speed = 5;
  }

  /** Advance by dt. Returns a shot when the trigger is pulled this frame. */
  update(dt: number, target: Target | null, rest: THREE.Vector3): Shot | null {
    const r = this.r;

    if (!target) {
      // Nothing to shoot: the hand drifts back towards the middle of the road.
      if (this.aim) {
        this.aim.lerp(rest, 1 - Math.exp(-dt * DRIFT_BACK_RATE));
      }

      this.targetId = -1;
      this.wait = Math.max(this.wait - dt, 0);

      return null;
    }

    if (target.id !== this.targetId) {
      // A new target: a moment to react, and a hand that starts somewhere else.
      this.targetId = target.id;
      this.wait = Math.max(
        this.wait,
        REACTION_DELAY + r() * REACTION_DELAY_SPREAD,
      );
      this.speed = CLOSE_SPEED + r() * CLOSE_SPEED_SPREAD;
      this.pickError(target);
    }

    const aim = (this.aim ??= rest.clone());
    const goal = target.centre.clone().add(this.error);

    aim.lerp(goal, 1 - Math.exp(-dt * this.speed));
    // A little tremble, so even a steady aim is never perfectly still.
    aim.x += (r() - RANDOM_CENTRE) * TREMBLE;
    aim.y += (r() - RANDOM_CENTRE) * TREMBLE;
    this.wait -= dt;
    if (this.wait > 0) {
      return null;
    }

    const shot: Shot = { at: aim.clone(), target };

    if (this.burst > 0) {
      this.burst--;
      this.wait = BURST_GAP + r() * BURST_GAP_SPREAD;
    } else if (r() < this.burstChance) {
      this.burst = 1 + Math.floor(r() * MAX_BURST_FOLLOW_UPS);
      this.wait = BURST_GAP + r() * BURST_GAP_SPREAD;
    } else {
      // Mostly quick, sometimes a long look before the next pull.
      this.wait = QUICK_PAUSE + r() * r() * LONG_LOOK_SPREAD;
    }

    if (this.burst === 0) {
      this.pickError(target);
    }

    return shot;
  }

  private pickError(t: Target) {
    const r = this.r;
    const a = r() * Math.PI * 2;
    const miss = r() < this.missChance;
    const d =
      t.radius *
      (miss ? MISS_DISTANCE + r() * MISS_DISTANCE_SPREAD : r() * HIT_SPREAD);

    this.error.set(Math.cos(a) * d, Math.sin(a) * d, 0);
  }
}
