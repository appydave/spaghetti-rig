import * as THREE from "three";
import { rng } from "./toon";

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
    readonly missChance = 0.22,
    readonly burstChance = 0.3,
  ) {
    this.r = rng(seed);
    this.wait = 0.3 + this.r() * 0.5;
    this.speed = 5;
  }

  /** Advance by dt. Returns a shot when the trigger is pulled this frame. */
  update(dt: number, target: Target | null, rest: THREE.Vector3): Shot | null {
    const r = this.r;
    if (!target) {
      // Nothing to shoot: the hand drifts back towards the middle of the road.
      if (this.aim) this.aim.lerp(rest, 1 - Math.exp(-dt * 1.5));
      this.targetId = -1;
      this.wait = Math.max(this.wait - dt, 0);
      return null;
    }
    if (target.id !== this.targetId) {
      // A new target: a moment to react, and a hand that starts somewhere else.
      this.targetId = target.id;
      this.wait = Math.max(this.wait, 0.18 + r() * 0.3);
      this.speed = 3.5 + r() * 3.5;
      this.pickError(target);
      this.aim ??= rest.clone();
    }
    const goal = target.centre.clone().add(this.error);
    this.aim!.lerp(goal, 1 - Math.exp(-dt * this.speed));
    // A little tremble, so even a steady aim is never perfectly still.
    this.aim!.x += (r() - 0.5) * 0.02;
    this.aim!.y += (r() - 0.5) * 0.02;
    this.wait -= dt;
    if (this.wait > 0) return null;
    const shot: Shot = { at: this.aim!.clone(), target };
    if (this.burst > 0) {
      this.burst--;
      this.wait = 0.07 + r() * 0.05;
    } else if (r() < this.burstChance) {
      this.burst = 1 + Math.floor(r() * 3);
      this.wait = 0.07 + r() * 0.05;
    } else {
      // Mostly quick, sometimes a long look before the next pull.
      this.wait = 0.22 + r() * r() * 1.1;
    }
    if (this.burst === 0) this.pickError(target);
    return shot;
  }

  private pickError(t: Target) {
    const r = this.r;
    const a = r() * Math.PI * 2;
    const miss = r() < this.missChance;
    const d = t.radius * (miss ? 1.5 + r() * 0.9 : r() * 0.45);
    this.error.set(Math.cos(a) * d, Math.sin(a) * d, 0);
  }
}
