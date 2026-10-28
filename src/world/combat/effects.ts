import * as THREE from "three";
import {
  ringFader,
  stepFaders,
  tracerFader,
  type Fader,
  type RingLook,
} from "#root/src/world/combat/fx/faders.ts";
import {
  addBurst,
  addHealSparkles,
  makeSparks,
  stepParticles,
  type BurstOptions,
  type Particle,
} from "#root/src/world/combat/fx/particles.ts";
import {
  muzzleFader,
  textFader,
  type TextLook,
} from "#root/src/world/combat/fx/sprites.ts";
import { FX } from "#root/src/world/palette.ts";

const FLASH_DISTANCE = 9;
const FLASH_LIGHT_DECAY = 2;
const CONFETTI_COUNT = 120;
const CONFETTI_SPEED = 9;
const CONFETTI_SIZE = 0.12;
const CONFETTI_LIFE = 2.6;
const CONFETTI_GRAVITY = 5;
const CONFETTI_UP = 1.4;
const HEAL_RING_SIZE = 1.6;
const HEAL_RING_LIFE = 0.9;
const TRACER_DEFAULT_WIDTH = 0.06;
const BEAM_WIDTH = 0.22;
const BEAM_CORE_WIDTH = 0.08;
const MUZZLE_LIGHT_INTENSITY = 6;
const MUZZLE_LIGHT_TIME = 0.08;
const FLASH_FADE_RATE = 80;

/** Sparks, rings, tracers, flashes, confetti and floating text. Cheap and pooled. */
export class Effects {
  private readonly sparks = makeSparks();
  private particles: Particle[] = [];
  private faders: Fader[] = [];
  private readonly dummy = new THREE.Object3D();
  readonly flash = new THREE.PointLight(
    FX.muzzleLight,
    0,
    FLASH_DISTANCE,
    FLASH_LIGHT_DECAY,
  );
  private flashT = 0;

  constructor(private readonly scene: THREE.Scene) {
    scene.add(this.sparks, this.flash);
  }

  burst(at: THREE.Vector3, opts: BurstOptions = {}) {
    addBurst(this.particles, at, opts);
  }

  confetti(at: THREE.Vector3, n = CONFETTI_COUNT) {
    this.burst(at, {
      n,
      colors: FX.confetti,
      speed: CONFETTI_SPEED,
      size: CONFETTI_SIZE,
      life: CONFETTI_LIFE,
      gravity: CONFETTI_GRAVITY,
      up: CONFETTI_UP,
    });
  }

  /** Rising green-and-yellow sparkles around a body. */
  heal(at: THREE.Vector3) {
    addHealSparkles(this.particles, at);
    this.ring(at, {
      color: FX.healRing,
      size: HEAL_RING_SIZE,
      life: HEAL_RING_LIFE,
      flat: true,
    });
  }

  ring(at: THREE.Vector3, look: RingLook) {
    this.faders.push(ringFader(this.scene, at, look));
  }

  tracer(
    from: THREE.Vector3,
    to: THREE.Vector3,
    color = FX.tracer,
    width = TRACER_DEFAULT_WIDTH,
  ) {
    this.faders.push(tracerFader(this.scene, from, to, { color, width }));
  }

  /** A thick glowing beam (tool card power shot). */
  beam(from: THREE.Vector3, to: THREE.Vector3, color = FX.beam) {
    this.tracer(from, to, color, BEAM_WIDTH);
    this.tracer(from, to, FX.beamCore, BEAM_CORE_WIDTH);
  }

  muzzle(at: THREE.Vector3, color = FX.muzzle) {
    this.flash.position.copy(at);
    this.flash.color.set(color);
    this.flash.intensity = MUZZLE_LIGHT_INTENSITY;
    this.flashT = MUZZLE_LIGHT_TIME;
    this.faders.push(muzzleFader(this.scene, at, color));
  }

  /** Floating text in the world ("+100", "−30%"). */
  text(at: THREE.Vector3, s: string, look: TextLook) {
    this.faders.push(textFader(this.scene, at, s, look));
  }

  update(dt: number) {
    this.flashT -= dt;
    if (this.flashT <= 0) {
      this.flash.intensity = Math.max(
        0,
        this.flash.intensity - dt * FLASH_FADE_RATE,
      );
    }

    this.particles = stepParticles(this.particles, this.sparks, this.dummy, dt);
    stepFaders(this.faders, dt);
  }

  clear() {
    this.particles = [];
    for (const f of this.faders) {
      f.obj.removeFromParent();
      f.mat.dispose();
    }

    this.faders = [];
  }
}
