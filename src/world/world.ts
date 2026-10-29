import * as THREE from "three";
import type { AudioEngine, Sfx } from "#root/src/audio/audio.ts";
import { FULL_HEALTH, type Game } from "#root/src/content/load.ts";
import type { Player, Step } from "#root/src/content/script.ts";
import { CameraRig } from "#root/src/world/camera-rig.ts";
import { Character } from "#root/src/world/models/characters.ts";
import { Combat } from "#root/src/world/combat/combat.ts";
import { Effects } from "#root/src/world/combat/effects.ts";
import {
  shotView,
  syncScenery,
  updateBoss,
  updateDebt,
  updateStopWindow,
} from "#root/src/world/scene/frame.ts";
import { makeCamera } from "#root/src/world/scene/camera.ts";
import { lightScene } from "#root/src/world/scene/lighting.ts";
import { applyAspect, matchState } from "#root/src/world/scene/match-state.ts";
import { enterStep } from "#root/src/world/steps/enter-step.ts";
import type { StepContext } from "#root/src/world/steps/step-context.ts";
import { Street } from "#root/src/world/street.ts";
import { Timeline } from "#root/src/world/timeline.ts";
import { advanceWalk, type Walk } from "#root/src/world/walk.ts";
import { stateFor } from "#root/src/world/world-state.ts";
import { Debris } from "#root/src/world/combat/physics.ts";
import { State } from "#root/src/world/world-shared.ts";

export { walkSeconds } from "#root/src/world/world-shared.ts";

const DEBRIS_BOUNCE_VOLUME_BASE = 0.3;
const DEBRIS_BOUNCE_VOLUME_SCALE = 0.5;
const SHAKE_DECAY = 2.5;
const STEP_RATE = 4.2;
const STEP_VOLUME = 0.25;

/**
 * One player's world: street, gates, character, enemies, the stop's code window and the boss.
 * Both players get one each, built from the same seed, so they walk the same road side by side.
 */
export class PlayerWorld {
  readonly scene = new THREE.Scene();
  readonly camera = makeCamera();
  readonly character: Character;
  readonly fx: Effects;
  readonly debris: Debris;
  /** Health shown in the HUD (animated). */
  health = FULL_HEALTH;
  autoplay = false;

  private state: State | null = null;
  private walk: Walk | null = null;
  private shake = 0;
  private readonly rig = new CameraRig(this.camera);
  readonly combat: Combat;
  readonly street: Street;
  private readonly timeline = new Timeline();
  private readonly sun: THREE.DirectionalLight;
  private readonly ctx: StepContext;
  private stepRef: Step | null = null;

  get aspect() {
    return this.rig.aspect;
  }

  get shape() {
    return this.rig.shape;
  }

  private get camMode() {
    return this.rig.mode;
  }

  constructor(
    readonly player: Player,
    private readonly game: Game,
    private readonly audio: AudioEngine,
    private readonly pan: () => number,
  ) {
    this.sun = lightScene(this.scene);
    this.character = new Character(player);
    this.scene.add(this.character.root);
    this.fx = new Effects(this.scene);
    this.debris = new Debris(this.scene);
    this.debris.onBounce = (s) =>
      this.sfx(
        "debrisBounce",
        DEBRIS_BOUNCE_VOLUME_BASE + s * DEBRIS_BOUNCE_VOLUME_SCALE,
      );
    this.street = new Street(this.scene, game, player, this.rig);
    this.combat = new Combat({
      player,
      camera: this.camera,
      character: this.character,
      fx: this.fx,
      debris: this.debris,
      sfx: (name, volume) => this.sfx(name, volume),
      shake: (atLeast) => {
        this.shake = Math.max(this.shake, atLeast);
      },
      boss: () => this.street.boss,
      autoplay: () => this.autoplay,
      walking: () => this.walk !== null,
    });
    this.ctx = this.makeStepContext();
  }

  /** What the step handlers get of this world. */
  private makeStepContext(): StepContext {
    return {
      player: this.player,
      game: this.game,
      scene: this.scene,
      camera: this.camera,
      rig: this.rig,
      character: this.character,
      street: this.street,
      combat: this.combat,
      timeline: this.timeline,
      fx: this.fx,
      debris: this.debris,
      health: () => this.health,
      setHealth: (h) => {
        this.health = h;
      },
      setShake: (v) => {
        this.shake = v;
      },
      sfx: (name, volume) => this.sfx(name, volume),
      reconcile: (s) => this.reconcile(s),
    };
  }

  private sfx(name: Sfx, volume = 1) {
    this.audio.play(name, { pan: this.pan(), volume });
  }

  // ───────────────────────────── state ─────────────────────────────

  /** Make the world match a state, reusing whatever already matches. */
  private reconcile(s: State) {
    this.walk = null;
    matchState(this.ctx, s);
    this.state = s;
  }

  // ───────────────────────────── stepping ─────────────────────────────

  /** Jump straight to a step's settled look (back, mode switch, tier jump). */
  settle(step: Step) {
    this.stepRef = step;
    this.reconcile(stateFor(this.game, this.player, step));
    if (step.phase === "walk") {
      this.character.pose = "idle";
    }
  }

  /** Play a step forward from the previous one. */
  enter(step: Step) {
    this.stepRef = step;

    const walk = enterStep(this.ctx, step);

    if (walk) {
      this.walk = walk;
    }
  }

  /** Director drives walking so both players stay in lockstep. u: 0 → 1. */
  setWalk(u: number) {
    if (this.walk) {
      advanceWalk(this.ctx, this.walk, u);
    }
  }

  // ───────────────────────────── per frame ─────────────────────────────

  setAspect(aspect: number) {
    applyAspect(this.ctx, aspect, this.state, this.stepRef);
  }

  /** Jump the camera to its target at once (after a cut). */
  snapCamera() {
    this.rig.snap(this.character.root.position, shotView(this.ctx), this.shake);
    syncScenery(this.ctx, this.sun);
  }

  update(dt: number) {
    this.timeline.step(dt);

    this.shake = Math.max(0, this.shake - dt * SHAKE_DECAY);

    this.combat.stepEnemies(dt);
    if (this.autoplay && this.walk) {
      this.combat.autoShoot(dt);
    }

    this.character.aimAt(this.combat.aim);
    if (
      this.walk &&
      Math.floor(this.timeline.clock * STEP_RATE) !==
        Math.floor((this.timeline.clock - dt) * STEP_RATE)
    ) {
      this.sfx("step", STEP_VOLUME);
    }

    this.character.update(dt);
    for (const g of this.street.gates) {
      g.update(dt);
    }

    this.rig.step(
      dt,
      this.character.root.position,
      shotView(this.ctx),
      this.shake,
    );
    syncScenery(this.ctx, this.sun);
    updateStopWindow(this.ctx, dt);
    updateDebt(this.ctx, dt);
    updateBoss(this.ctx, dt);
    this.debris.step(dt);
    this.fx.update(dt);
  }
}
