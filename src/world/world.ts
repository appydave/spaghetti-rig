import * as THREE from "three";
import type { AudioEngine, Sfx } from "../audio/audio";
import { FULL_HEALTH, type Game, type PlayTier } from "../content/load";
import { nth, present } from "../nth";
import type { Player, Step } from "../show/script";
import { CameraRig, type ShotView } from "./camera-rig";
import { Character } from "./characters";
import { Combat } from "./combat";
import { CodeWindow } from "./codewindow";
import { Effects } from "./effects";
import type { EnemyKind } from "./enemies";
import { enterBoss } from "./boss-arrive-step";
import { enterBossDown } from "./boss-down-step";
import { enterBossPart } from "./boss-part-step";
import { enterFixed } from "./fixed-step";
import { enterProblem } from "./problem-step";
import type { StepContext } from "./step-context";
import { Street } from "./street";
import { Timeline } from "./timeline";
import { advanceWalk, startWalk, type Walk } from "./walk";
import { stateFor } from "./world-state";
import { Debris } from "./physics";
import { ease, lerp } from "./toon";
import { EVENT, WORLD } from "./palette";
import { State } from "./world-shared";

export { walkSeconds } from "./world-shared";
export type { CameraMode } from "./world-shared";

const CAMERA_FOV = 42;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 400;
const WIDESCREEN_WIDTH = 16;
const WIDESCREEN_HEIGHT = 9;
/** The picture shape a player lane starts with, before the real window size is known. */
const WIDESCREEN = WIDESCREEN_WIDTH / WIDESCREEN_HEIGHT;
const FOG_NEAR = 40;
const FOG_FAR = 120;
const HEMISPHERE_INTENSITY = 2.2;
const SUN_INTENSITY = 2.9;
const SHADOW_MAP_SIZE = 2048;
const SHADOW_EXTENT = 28;
const SHADOW_CAMERA_FAR = 120;
const SHADOW_BIAS = -0.0004;
const SHADOW_NORMAL_BIAS = 0.04;
const SHADOW_BLUR_RADIUS = 3;
const RIM_INTENSITY = 1.1;
const RIM_X = -30;
const RIM_Y = 20;
const RIM_Z = -40;
const DEBRIS_BOUNCE_VOLUME_BASE = 0.3;
const DEBRIS_BOUNCE_VOLUME_SCALE = 0.5;
const EXIT_WINDOW_SECONDS = 0.7;
const EXIT_SCALE_DEBT = 0.2;
const EXIT_SCALE_MUZZLE = 0.02;
const EXIT_SPIN_DEBT = 0.3;
const EXIT_SPIN_MUZZLE = 4;
const EXIT_BURST_COUNT = 18;
const EXIT_BURST_SPEED = 3;
const DEBT_SLOT_X = -1.1;
const DEBT_SLOT_SPACING_X = 0.7;
const DEBT_SLOT_Y = 2.8;
const DEBT_SLOT_ROW_RISE = 0.5;
const DEBT_BOB_HEIGHT = 0.1;
const DEBT_SLOT_Z = 0.3;
const DEBT_DEPTH_STEPS = 3;
const DEBT_SLOT_DEPTH_SPACING = 0.35;
const SUN_OFFSET_X = 14;
const SUN_HEIGHT = 30;
const SUN_OFFSET_Z = 16;
const SUN_TARGET_AHEAD = 8;
const SHAKE_DECAY = 2.5;
const STEP_RATE = 4.2;
const STEP_VOLUME = 0.25;
const READING_EASE_RATE = 6;
const READING_BOB_SPEED = 1.6;
const READING_BOB_HEIGHT = 0.004;
const DEBT_EASE_RATE = 4;
const DEBT_WOBBLE_SPEED = 3;
const DEBT_WOBBLE = 0.08;

/**
 * One player's world: street, gates, character, enemies, the stop's code window and the boss.
 * Both players get one each, built from the same seed, so they walk the same road side by side.
 */
export class PlayerWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    WIDESCREEN,
    CAMERA_NEAR,
    CAMERA_FAR,
  );
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
  private readonly street: Street;
  private readonly timeline = new Timeline();
  private readonly sun: THREE.DirectionalLight;
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
    this.scene.background = new THREE.Color(WORLD.sky);
    this.scene.fog = new THREE.Fog(WORLD.fog, FOG_NEAR, FOG_FAR);
    this.scene.add(
      new THREE.HemisphereLight(
        WORLD.hemisphereSky,
        WORLD.hemisphereGround,
        HEMISPHERE_INTENSITY,
      ),
    );
    this.sun = new THREE.DirectionalLight(WORLD.sun, SUN_INTENSITY);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);

    const sc = this.sun.shadow.camera;

    sc.left = -SHADOW_EXTENT;
    sc.right = SHADOW_EXTENT;
    sc.top = SHADOW_EXTENT;
    sc.bottom = -SHADOW_EXTENT;
    sc.near = 1;
    sc.far = SHADOW_CAMERA_FAR;
    this.sun.shadow.bias = SHADOW_BIAS;
    this.sun.shadow.normalBias = SHADOW_NORMAL_BIAS;
    this.sun.shadow.radius = SHADOW_BLUR_RADIUS;
    this.scene.add(this.sun, this.sun.target);

    const rim = new THREE.DirectionalLight(WORLD.rim, RIM_INTENSITY);

    rim.position.set(RIM_X, RIM_Y, RIM_Z);
    this.scene.add(rim);
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

  get windowKey(): string {
    return this.street.windowKey;
  }

  get bossTotal() {
    return this.street.bossTotal;
  }

  get bossLeft() {
    return this.street.bossLeft;
  }

  get score() {
    return this.combat.score;
  }

  get shots() {
    return this.combat.shots;
  }

  get shipped() {
    return this.combat.shipped;
  }

  get onSlip() {
    return this.combat.onSlip;
  }

  set onSlip(f: ((kind: EnemyKind) => void) | undefined) {
    this.combat.onSlip = f;
  }

  /** Aim at a point on screen (normalised device coords); fire if asked. Returns true when something was hit. */
  pointer(ndc: THREE.Vector2 | null, fire: boolean): boolean {
    return this.combat.pointer(ndc, fire);
  }

  /** Autoplay's aim on screen (normalised device coords), for its reticle. */
  autoAimScreen(): THREE.Vector2 | null {
    return this.combat.autoAimScreen();
  }

  /** For tests: screen-space centre of the first enemy, if any. */
  enemyScreen(): THREE.Vector2 | null {
    return this.combat.enemyScreen();
  }

  private sfx(name: Sfx, volume = 1) {
    this.audio.play(name, { pan: this.pan(), volume });
  }

  // ───────────────────────────── state ─────────────────────────────

  /** Make the world match a state, reusing whatever already matches. */
  private reconcile(s: State) {
    this.clearAnimations();

    const tier = nth(this.game.tiers, s.tier, "tiers");

    if (this.street.tier !== tier) {
      this.buildTier(tier);
    }

    this.character.root.position.set(0, 0, s.z);
    this.character.root.rotation.y = 0;
    this.character.pose = s.pose;
    this.street.sync(s, tier);
    this.health = s.health;
    this.rig.mode = s.camera;
    this.state = s;
  }

  private clearAnimations() {
    this.timeline.clear();
    this.walk = null;
  }

  private buildTier(tier: PlayTier) {
    this.street.clear();
    this.combat.clear();
    this.debris.clear();
    this.fx.clear();
    this.street.build(tier);
  }

  // ───────────────────────────── content → objects ─────────────────────────────

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

    const keepWin =
      this.street.window !== null &&
      (step.phase === "walk" || step.phase === "boss");
    // A window that is leaving is kept alive for its exit animation.
    const prevWindow = keepWin ? this.street.releaseWindow() : null;

    const s = stateFor(this.game, this.player, step);

    switch (step.phase) {
      case "walk":
        this.reconcile(s);
        this.exitWindow(prevWindow);
        this.walk = startWalk(this.makeStepContext(), step);
        break;
      case "problem":
        enterProblem(this.makeStepContext(), step, s);
        break;
      case "fixed":
        enterFixed(this.makeStepContext(), step, s);
        break;
      case "boss":
        this.reconcile(s);
        if (keepWin) {
          this.exitWindow(prevWindow);
        }

        enterBoss(this.makeStepContext());
        break;
      case "bossPart":
        enterBossPart(this.makeStepContext(), step, s);
        break;
      case "bossDown":
        enterBossDown(this.makeStepContext(), s);
        break;
      case "tool":
        this.reconcile(s);
        if (this.player === "p2") {
          this.character.fire();
        }

        break;
      default:
        this.reconcile(s);
    }
  }

  private exitWindow(w: { win: CodeWindow } | null) {
    if (!w) {
      return;
    }

    const win = w.win;
    const entry = this.timeline.track({ dispose: () => win.dispose() });
    const from = win.group.position.clone();
    const s0 = win.group.scale.x;
    const p1 = this.player === "p1";

    this.timeline.tween(
      EXIT_WINDOW_SECONDS,
      (k) => {
        const e = ease.inOutCubic(k);
        const to = p1
          ? this.debtSlot(this.street.debt.length - 1)
          : this.character.muzzleWorld();

        win.group.position.lerpVectors(from, to, e);
        win.group.scale.setScalar(
          lerp(s0, p1 ? EXIT_SCALE_DEBT : EXIT_SCALE_MUZZLE, e),
        );
        win.group.rotation.z = e * (p1 ? EXIT_SPIN_DEBT : EXIT_SPIN_MUZZLE);
      },
      () => {
        if (!p1) {
          this.fx.burst(this.character.muzzleWorld(), {
            colors: EVENT.windowExitBurst,
            n: EXIT_BURST_COUNT,
            speed: EXIT_BURST_SPEED,
          });
        }

        win.dispose();
        this.timeline.untrack(entry);
      },
    );
  }

  /** Director drives walking so both players stay in lockstep. u: 0 → 1. */
  setWalk(u: number) {
    if (this.walk) {
      advanceWalk(this.makeStepContext(), this.walk, u);
    }
  }

  // ───────────────────────────── per frame ─────────────────────────────

  private debtSlot(i: number) {
    const c = this.character.root.position;
    const t = this.timeline.clock;

    // Above and beside player 1's far shoulder: off the follow camera's lens, behind the stop window in side views.
    return new THREE.Vector3(
      DEBT_SLOT_X - (i % 2) * DEBT_SLOT_SPACING_X,
      DEBT_SLOT_Y +
        Math.floor(i / 2) * DEBT_SLOT_ROW_RISE +
        Math.sin(t * 2 + i) * DEBT_BOB_HEIGHT,
      c.z - DEBT_SLOT_Z - (i % DEBT_DEPTH_STEPS) * DEBT_SLOT_DEPTH_SPACING,
    );
  }

  setAspect(aspect: number) {
    const changed = this.rig.setAspect(aspect);

    if (this.street.boss && this.state) {
      this.street.boss.group.position.z =
        this.state.z -
        this.rig.bossBack(present(this.street.bossLayout, "boss layout"));
    }

    // Re-lay the stop window for the new shape.
    if (changed && this.state && this.stepRef) {
      const keep = this.health;

      this.reconcile(this.state);
      this.health = keep;
    }
  }

  private shotView(): ShotView {
    return {
      layout: this.street.bossLayout,
      window: this.street.window?.win ?? null,
      pile: this.street.pile !== null,
    };
  }

  private updateCamera(dt: number) {
    const c = this.character.root.position;

    this.rig.step(dt, c, this.shotView(), this.shake);
    this.syncScenery();
  }

  /** What the camera's position decides about the scenery. */
  private syncScenery() {
    const c = this.character.root.position;

    // Side-on views look across the street, so the near side's buildings step out of the way.
    const right = this.street.city?.getObjectByName("city-right");
    const ahead = this.rig.mode === "follow" || this.rig.mode === "boss";

    if (right) {
      right.visible = ahead;
    }

    for (const g of this.street.gates) {
      g.near.visible = ahead;
    }

    // Keep the sun's shadow box centred on the action.
    this.sun.position.set(c.x - SUN_OFFSET_X, SUN_HEIGHT, c.z + SUN_OFFSET_Z);
    this.sun.target.position.set(c.x, 0, c.z - SUN_TARGET_AHEAD);
  }

  /** Jump the camera to its target at once (after a cut). */
  snapCamera() {
    this.rig.snap(this.character.root.position, this.shotView(), this.shake);
    this.syncScenery();
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

    this.updateCamera(dt);
    if (this.street.window) {
      const w = this.street.window;

      if (w.reading) {
        const t = this.rig.readingPose(w.win, this.character.root.position.z);

        w.win.group.position.lerp(t.pos, 1 - Math.exp(-dt * READING_EASE_RATE));
        w.win.group.scale.setScalar(
          lerp(
            w.win.group.scale.x,
            t.scale,
            1 - Math.exp(-dt * READING_EASE_RATE),
          ),
        );
        this.rig.face(w.win.group);
        w.win.group.position.y +=
          Math.sin(this.timeline.clock * READING_BOB_SPEED) *
          READING_BOB_HEIGHT;
      }

      w.win.update(dt);
    }

    for (const [i, d] of this.street.debt.entries()) {
      // The result shot shows the spaghetti pile instead; the trailing cards would cover the stamp.
      d.win.group.visible =
        this.rig.mode !== "portrait" && this.rig.mode !== "boss";
      d.win.group.position.lerp(
        this.debtSlot(i),
        1 - Math.exp(-dt * DEBT_EASE_RATE),
      );
      this.rig.face(d.win.group);
      d.win.group.rotateZ(
        Math.sin(this.timeline.clock * DEBT_WOBBLE_SPEED + i) * DEBT_WOBBLE,
      );
      d.win.update(dt);
    }

    if (this.street.boss) {
      this.street.boss.update(dt);
      this.street.boss.group.lookAt(
        this.camera.position.x,
        this.street.boss.group.position.y,
        this.camera.position.z,
      );
    }

    this.debris.step(dt);
    this.fx.update(dt);
  }

  get walking() {
    return !!this.walk;
  }

  get enemyCount() {
    return this.combat.enemies.length;
  }

  get debrisCount() {
    return this.debris.count;
  }
}
