import * as THREE from "three";
import type { AudioEngine, Sfx } from "../audio/audio";
import {
  FULL_HEALTH,
  TIER_HEALTH_LOSS,
  toolFor,
  type Game,
  type PlayTier,
} from "../content/load";
import { context2d } from "../dom";
import { nth, present } from "../nth";
import { healthAt, type Player, type Step } from "../show/script";
import { CameraRig, type ShotView } from "./camera-rig";
import { Character } from "./characters";
import { Combat } from "./combat";
import { CodeWindow } from "./codewindow";
import { Effects } from "./effects";
import { Enemy, type EnemyKind } from "./enemies";
import { makePile } from "./pile";
import { Street } from "./street";
import { Timeline } from "./timeline";
import { makeStopWindow, paintStopCard } from "./tier-content";
import { stateFor } from "./world-state";
import { Debris } from "./physics";
import { beforeParen } from "../ui/card";
import { clamp01, ease, lerp, rng } from "./toon";
import { BOLT, EVENT, WORLD } from "./palette";
import { DEBT_WINDOW_COLS, State, standZ } from "./world-shared";

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

const PROBLEM_ALARM_DELAY = 0.2;
const CARD_LAUNCH_DELAY = 1.5;
const CARD_FLIGHT_SECONDS = 0.5;
const CARD_LAUNCH_Y = 6;
const CARD_LAUNCH_Z = -34;
const CARD_HIT_Y = 0.6;
const CARD_HIT_Z = -0.6;
const CARD_FLIGHT_START_SCALE = 0.35;
const CARD_FLIGHT_END_SCALE = 0.55;
const CARD_FLIGHT_SPIN = 2.5;
const DAMAGE_VOLUME = 0.8;
const HIT_BURST_COUNT = 40;
const HIT_BURST_SPEED = 7;
const HIT_RING_SIZE = 1.6;
const HIT_RING_LIFE = 0.4;
const HIT_TEXT_RISE = 1.2;
const HIT_TEXT_LIFE = 1.4;
const HEALTH_DROP_SECONDS = 0.5;
const CARD_BOUNCE_SECONDS = 0.55;
const OLD_CARD_RATTLE = 0.4;
const AIM_TO_FIRE_DELAY = 0.45;
const BEAM_RING_SIZE = 2.5;
const BEAM_RING_LIFE = 0.5;
const FIRST_CRACK_DELAY = 0.65;
const FIRST_CRACK_SEED = 3;
const MORE_CRACKS_DELAY = 0.85;
const SECOND_CRACK_SEED = 9;
const SECOND_CRACK_U = 0.3;
const SECOND_CRACK_V = 0.6;
const THIRD_CRACK_SEED = 13;
const THIRD_CRACK_U = 0.75;
const THIRD_CRACK_V = 0.35;
const SHATTER_DELAY = 1.05;
const SHATTER_POWER = 7;
const SHATTER_GRID_SHORT = 5;
const SHATTER_GRID_LONG = 7;
const SHATTER_SEED_BASE = 21;
const SHATTER_SHAKE = 0.5;
const FIXED_CARD_DELAY = 1.3;
const FIXED_CARD_SECONDS = 0.6;
const FIXED_CARD_DROP = 3;
const FIXED_CARD_START_SCALE = 0.6;
const HEAL_DELAY = 1.7;
const HEAL_RISE = 1.2;
const HEAL_TEXT_RISE = 1.4;
const HEAL_TEXT_LIFE = 1.6;
const HEAL_SECONDS = 0.8;
const VICTORY_POSE_SECONDS = 1.2;
const BOSS_DROP_HEIGHT = 26;
const BOSS_ARRIVE_SOUND_DELAY = 0.9;
const BOSS_DROP_SECONDS = 1.3;
const BOSS_LANDING_SHAKE = 1.2;
const BOSS_LANDING_DUST_Y = 0.2;
const BOSS_LANDING_BURST_COUNT = 60;
const BOSS_LANDING_BURST_SPEED = 10;
const MIN_TWEEN_SECONDS = 0.001;
const BOSS_BOUNCE_SHOT_A = 2.6;
const BOSS_BOUNCE_SHOT_B = 3.0;
const BOSS_BOUNCE_SHOT_C = 3.4;
const PART_SHOT_A_DELAY = 0.2;
const PART_SHOT_B_DELAY = 0.5;
const KO_BLOW_DELAY = 0.9;
const KO_BLOW_WIDTH = 2.2;
const KO_BLOW_SECONDS = 0.45;
const KO_BLOW_SPIN = 6;
const KO_SHAKE = 1.4;
const KO_BURST_COUNT = 50;
const KO_BURST_SPEED = 8;
const KO_TEXT_RISE = 1.4;
const KO_TEXT_SIZE = 1.3;
const KO_TEXT_LIFE = 1.8;
const KO_SHATTER_POWER = 5;
const KO_SHATTER_GRID_COLS = 3;
const KO_SHATTER_GRID_ROWS = 2;
const KO_HEALTH_SECONDS = 0.6;
const TOOL_FIRE_DELAY = 0.25;
const TOOL_BOLT_SECONDS = 0.4;
const TOOL_BOLT_SPIN = 8;
const PART_BURST_COUNT = 50;
const PART_BURST_SPEED = 9;
const PART_TEXT_RISE = 1.8;
const PART_TEXT_WORDS = 2;
const PART_TEXT_SIZE = 1.1;
const PART_TEXT_LIFE = 1.6;
const PART_BREAK_SHAKE = 0.8;
const PART_HEALTH_SECONDS = 0.6;
const PILE_DROP_HEIGHT = 9;
const PILE_DROP_SECONDS = 0.9;
const PILE_LANDING_SHAKE = 0.7;
const PILE_DUST_Y = 0.4;
const PILE_BURST_COUNT = 40;
const PILE_BURST_SPEED = 6;
const PILE_LOSE_SOUND_DELAY = 0.2;
const PILE_LOSE_VOLUME = 0.6;
const FINISH_FIRE_DELAY = 0.3;
const CORE_CRACK_SEED_FIRST = 5;
const CORE_CRACKS_DELAY = 0.7;
const CORE_CRACK_SEED_B = 17;
const CORE_CRACK_B_U = 0.3;
const CORE_CRACK_B_V = 0.4;
const CORE_CRACK_SEED_C = 23;
const CORE_CRACK_C_U = 0.7;
const CORE_CRACK_C_V = 0.7;
const BOSS_DESTROY_DELAY = 1.1;
const BOSS_DEFEAT_SHAKE = 1.5;
const BOSS_CONFETTI_COUNT = 200;
const BOSS_RING_SIZE = 6;
const BOSS_RING_LIFE = 0.8;
const WIN_SOUND_DELAY = 1.6;

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
const BOLT_WIDTH = 256;
const BOLT_HEIGHT = 340;
const BOLT_CORNER = 22;
const BOLT_BORDER = 12;
const BOLT_INSET = 8;
/** The card's inner frame sits BOLT_INSET in from each edge, so it is this much smaller than the card. */
const BOLT_INNER_WIDTH = BOLT_WIDTH - BOLT_INSET * 2;
const BOLT_INNER_HEIGHT = BOLT_HEIGHT - BOLT_INSET * 2;
/** The words are centred on the card. */
const BOLT_TEXT_X = BOLT_WIDTH / 2;
const BOLT_INNER_CORNER = 16;
const BOLT_TEXT_LINES = 3;
const BOLT_TEXT_TOP = 130;
const BOLT_TEXT_LINE = 52;
const BOLT_PLANE_HEIGHT = 1.33;
const BOLT_LIGHT_INTENSITY = 4;
const BOLT_LIGHT_RANGE = 6;

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
  private walk: {
    from: number;
    to: number;
    u: number;
    spawns: { at: number; kind: EnemyKind; seed: number }[];
    next: number;
  } | null = null;
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

    const prevWindow = this.street.window;
    const keepWin =
      prevWindow && (step.phase === "walk" || step.phase === "boss");

    if (keepWin) {
      this.street.window = null;
    } // keep it alive for its exit animation

    const s = stateFor(this.game, this.player, step);

    switch (step.phase) {
      case "walk":
        this.reconcile(s);
        this.exitWindow(prevWindow);
        this.startWalk(step);
        break;
      case "problem":
        this.enterProblem(step, s);
        break;
      case "fixed":
        this.enterFixed(step, s);
        break;
      case "boss":
        this.reconcile(s);
        if (keepWin) {
          this.exitWindow(prevWindow);
        }

        this.enterBoss(s);
        break;
      case "bossPart":
        this.enterBossPart(step, s);
        break;
      case "bossDown":
        this.enterBossDown(step, s);
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

  private startWalk(step: Step) {
    const tier = this.street.playing;
    const to =
      step.stop < tier.stops.length
        ? standZ(step.stop)
        : standZ(tier.stops.length);
    const from = this.character.root.position.z;
    const r = rng(
      WALK_SEED_BASE +
        step.tier * WALK_SEED_PER_TIER +
        step.stop * WALK_SEED_PER_STOP,
    );
    const spawns: { at: number; kind: EnemyKind; seed: number }[] = [];
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

    this.walk = { from, to, u: 0, spawns, next: 0 };
    this.character.pose = "walk";
  }

  /** Director drives walking so both players stay in lockstep. u: 0 → 1. */
  setWalk(u: number) {
    const w = this.walk;

    if (!w) {
      return;
    }

    w.u = u;
    this.character.root.position.z = lerp(
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
      this.spawn(next);
    }

    if (u >= 1) {
      this.character.pose = "idle";
    }
  }

  private spawn(sp: { kind: EnemyKind; seed: number }) {
    const r = rng(sp.seed);
    const z0 =
      this.character.root.position.z -
      SPAWN_DISTANCE_AHEAD -
      r() * SPAWN_DISTANCE_JITTER;
    const side = r() < COIN_FLIP ? -1 : 1;
    let from: THREE.Vector3;
    let to: THREE.Vector3;
    let speed: number;

    if (sp.kind === "spaghetti") {
      from = new THREE.Vector3(side * SPAGHETTI_START_X, 0, z0);
      to = new THREE.Vector3(
        -side * SPAGHETTI_END_X,
        0,
        z0 + SPAGHETTI_TRAVEL_Z,
      );
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

    this.combat.enemies.push(e);
    this.scene.add(e.group);
  }

  private enterProblem(step: Step, s: State) {
    // Arrive with no window, then the angry card flies down the road and slams in.
    const before =
      this.player === "p1"
        ? healthAt(this.game, { ...step, phase: "walk" }, "p1")
        : FULL_HEALTH;

    this.reconcile(s);
    this.combat.clearStreet();

    const w = this.street.shownWindow;

    w.reading = false;

    const g = w.win.group;

    g.visible = false;
    this.health = before;
    this.street.gateAt(step.stop).state = "idle";
    this.character.pose = "idle";
    this.timeline.after(PROBLEM_ALARM_DELAY, () => {
      this.street.gateAt(step.stop).state = "alarm";
    });

    const launch = CARD_LAUNCH_DELAY;
    const flight = CARD_FLIGHT_SECONDS;

    this.timeline.after(launch, () => {
      g.visible = true;

      const start = this.character.root.position
        .clone()
        .add(new THREE.Vector3(0, CARD_LAUNCH_Y, CARD_LAUNCH_Z));
      const chest = this.character.chestWorld();

      this.timeline.tween(flight, (k) => {
        const e = ease.inCubic(k);

        g.position.lerpVectors(
          start,
          chest.clone().add(new THREE.Vector3(0, CARD_HIT_Y, CARD_HIT_Z)),
          e,
        );
        g.scale.setScalar(
          lerp(CARD_FLIGHT_START_SCALE, CARD_FLIGHT_END_SCALE, e),
        );
        g.rotation.set(0, 0, (1 - e) * CARD_FLIGHT_SPIN);
        g.quaternion.premultiply(new THREE.Quaternion());
        this.rig.face(g);
      });
    });
    this.timeline.after(launch + flight, () => {
      this.sfx("slam");
      this.sfx("damage", DAMAGE_VOLUME);
      this.character.hit();
      this.shake = 1;

      const chest = this.character.chestWorld();

      this.fx.burst(chest, {
        colors: EVENT.hitBurst,
        n: HIT_BURST_COUNT,
        speed: HIT_BURST_SPEED,
      });
      this.fx.ring(
        chest,
        EVENT.hitRing,
        HIT_RING_SIZE,
        HIT_RING_LIFE,
        false,
        this.camera.position,
      );
      this.fx.text(
        chest.clone().add(new THREE.Vector3(0, HIT_TEXT_RISE, 0)),
        `−${Math.round(TIER_HEALTH_LOSS / this.street.playing.stops.length)}%`,
        EVENT.hitText,
        1.0,
        HIT_TEXT_LIFE,
      );

      const from = this.health;

      this.timeline.tween(HEALTH_DROP_SECONDS, (k) => {
        this.health = lerp(from, s.health, ease.outCubic(k));
      });
      this.character.pose = s.pose;

      // Bounce back into the reading spot.
      const hitPos = g.position.clone();
      const hitScale = g.scale.x;

      this.timeline.tween(
        CARD_BOUNCE_SECONDS,
        (k) => {
          const e = ease.outBack(k);
          const target = this.rig.readingPose(
            w.win,
            this.character.root.position.z,
          );

          g.position.lerpVectors(hitPos, target.pos, e);
          g.scale.setScalar(lerp(hitScale, target.scale, e));
          this.rig.face(g);
        },
        () => {
          w.reading = true;
        },
      );
    });
  }

  private enterFixed(step: Step, s: State) {
    this.reconcile(s);

    const stop = nth(this.street.playing.stops, step.stop, "stops");
    const fixed = this.street.shownWindow;

    if (this.player === "p1") {
      return;
    }

    fixed.reading = true;
    fixed.win.group.visible = false;

    const old = this.timeline.track(
      makeStopWindow(
        { game: this.game, tier: this.street.playing },
        stop,
        "problem",
        this.rig.shape,
      ),
    );

    old.rattle = OLD_CARD_RATTLE;
    this.scene.add(old.group);

    const pose = this.rig.readingPose(old, this.character.root.position.z);

    old.group.position.copy(pose.pos);
    old.group.scale.setScalar(pose.scale);
    this.rig.face(old.group);
    this.health =
      FULL_HEALTH - TIER_HEALTH_LOSS / this.street.playing.stops.length;
    this.street.gateAt(step.stop).state = "alarm";
    this.character.pose = "aim";
    this.timeline.after(AIM_TO_FIRE_DELAY, () => {
      this.character.fire();

      const from = this.character.muzzleWorld();
      const to = old.group.position.clone();

      this.fx.muzzle(from, EVENT.toolMuzzle);
      this.fx.beam(from, to);
      this.fx.ring(
        to,
        EVENT.toolRing,
        BEAM_RING_SIZE,
        BEAM_RING_LIFE,
        false,
        this.camera.position,
      );
      this.sfx("cardPlay");
    });
    this.timeline.after(FIRST_CRACK_DELAY, () => {
      old.crack(FIRST_CRACK_SEED);
      this.sfx("glassCrack");
    });
    this.timeline.after(MORE_CRACKS_DELAY, () => {
      old.crack(SECOND_CRACK_SEED, SECOND_CRACK_U, SECOND_CRACK_V);
      old.crack(THIRD_CRACK_SEED, THIRD_CRACK_U, THIRD_CRACK_V);
    });
    this.timeline.after(SHATTER_DELAY, () => {
      this.sfx("shatter");

      const from = this.character.muzzleWorld();

      old.shatter(
        this.debris,
        from.setY(from.y - 1),
        SHATTER_POWER,
        this.rig.shape === "tall"
          ? [SHATTER_GRID_SHORT, SHATTER_GRID_LONG]
          : [SHATTER_GRID_LONG, SHATTER_GRID_SHORT],
        SHATTER_SEED_BASE + step.stop,
      );
      this.timeline.untrack(old);
      this.shake = SHATTER_SHAKE;
    });
    this.timeline.after(FIXED_CARD_DELAY, () => {
      this.sfx("codeFix");
      fixed.win.group.visible = true;

      const g = fixed.win.group;

      fixed.reading = false;
      this.timeline.tween(
        FIXED_CARD_SECONDS,
        (k) => {
          const t = this.rig.readingPose(
            fixed.win,
            this.character.root.position.z,
          );

          g.position
            .copy(t.pos)
            .add(
              new THREE.Vector3(0, (1 - ease.outBack(k)) * FIXED_CARD_DROP, 0),
            );
          g.scale.setScalar(
            t.scale * lerp(FIXED_CARD_START_SCALE, 1, ease.outBack(k)),
          );
          this.rig.face(g);
        },
        () => {
          fixed.reading = true;
        },
      );
      this.street.gateAt(step.stop).state = "open";
    });
    this.timeline.after(HEAL_DELAY, () => {
      this.sfx("heal");
      this.fx.heal(
        this.character.root.position
          .clone()
          .add(new THREE.Vector3(0, HEAL_RISE, 0)),
      );
      this.fx.text(
        this.character
          .chestWorld()
          .add(new THREE.Vector3(0, HEAL_TEXT_RISE, 0)),
        "+100% HP",
        EVENT.healText,
        1.0,
        HEAL_TEXT_LIFE,
      );

      const from = this.health;

      this.timeline.tween(HEAL_SECONDS, (k) => {
        this.health = lerp(from, FULL_HEALTH, ease.outCubic(k));
      });
      this.character.pose = "victory";
      this.timeline.after(VICTORY_POSE_SECONDS, () => {
        this.character.pose = "idle";
      });
    });
  }

  private enterBoss(s: State) {
    this.combat.clearStreet();

    const boss = this.street.bossModel;
    const home = boss.group.position.clone();

    boss.group.position.y = home.y + BOSS_DROP_HEIGHT;
    this.timeline.after(BOSS_ARRIVE_SOUND_DELAY, () => this.sfx("bossArrive"));
    this.timeline.tween(
      BOSS_DROP_SECONDS,
      (k) => {
        boss.group.position.y =
          home.y + BOSS_DROP_HEIGHT * (1 - ease.outCubic(clamp01(k)));
      },
      () => {
        this.shake = BOSS_LANDING_SHAKE;
        boss.shake = 1;
        this.fx.burst(home.clone().setY(BOSS_LANDING_DUST_Y), {
          n: BOSS_LANDING_BURST_COUNT,
          colors: EVENT.bossArriveBurst,
          speed: BOSS_LANDING_BURST_SPEED,
        });
      },
    );
    this.timeline.tween(MIN_TWEEN_SECONDS, () => void 0);
    if (this.player === "p1") {
      // Player 1 has nothing that works: shots bounce off.
      for (const t of [
        BOSS_BOUNCE_SHOT_A,
        BOSS_BOUNCE_SHOT_B,
        BOSS_BOUNCE_SHOT_C,
      ]) {
        this.timeline.after(t, () => this.combat.shootBoss());
      }
    }

    void s;
  }

  private enterBossPart(step: Step, s: State) {
    if (this.player === "p1") {
      this.reconcile({
        ...s,
        pose: step.part === 0 ? "hurt" : "down",
        health:
          step.part === 0
            ? healthAt(this.game, { ...step, phase: "boss" }, "p1")
            : 0,
      });
      this.timeline.after(PART_SHOT_A_DELAY, () => this.combat.shootBoss());
      this.timeline.after(PART_SHOT_B_DELAY, () => this.combat.shootBoss());
      if (step.part === 0) {
        // The boss finishes player 1 with one blow.
        this.timeline.after(KO_BLOW_DELAY, () => {
          const firstStop = nth(this.street.playing.stops, 0, "stops");
          const blow = this.timeline.track(
            new CodeWindow(
              paintStopCard(
                { game: this.game, tier: this.street.playing },
                firstStop,
                "problem",
                DEBT_WINDOW_COLS,
              ),
              KO_BLOW_WIDTH,
              "angry",
            ),
          );

          this.scene.add(blow.group);

          const from = this.street.bossModel.partWorld(0);
          const to = this.character.chestWorld();

          this.timeline.tween(
            KO_BLOW_SECONDS,
            (k) => {
              blow.group.position.lerpVectors(from, to, ease.inCubic(k));
              blow.group.rotation.z = k * KO_BLOW_SPIN;
            },
            () => {
              this.sfx("slam");
              this.sfx("lose");
              this.shake = KO_SHAKE;
              this.character.hit();
              this.character.pose = "down";
              this.fx.burst(to, {
                n: KO_BURST_COUNT,
                colors: EVENT.bossHitBurst,
                speed: KO_BURST_SPEED,
              });
              this.fx.text(
                to.clone().add(new THREE.Vector3(0, KO_TEXT_RISE, 0)),
                "K.O.",
                EVENT.koText,
                KO_TEXT_SIZE,
                KO_TEXT_LIFE,
              );
              blow.shatter(this.debris, from, KO_SHATTER_POWER, [
                KO_SHATTER_GRID_COLS,
                KO_SHATTER_GRID_ROWS,
              ]);
              this.timeline.untrack(blow);

              const h0 = this.health;

              this.timeline.tween(KO_HEALTH_SECONDS, (k) => {
                this.health = lerp(h0, 0, k);
              });
            },
          );
        });
      }

      return;
    }

    // Player 2 fires the tool earned at that stop at the matching part.
    this.reconcile({ ...s, broken: step.part });

    const boss = this.street.bossModel;

    this.street.bossLeft = this.street.bossTotal - step.part;

    const part = nth(this.street.playing.boss.parts, step.part, "boss parts");
    const tool = toolFor(this.game, part.beatenBy);

    this.timeline.after(TOOL_FIRE_DELAY, () => {
      this.character.fire();

      const from = this.character.muzzleWorld();
      const to = boss.partWorld(step.part);

      this.fx.muzzle(from, EVENT.partMuzzle);
      this.sfx("cardPlay");

      const card = this.timeline.track(toolBolt(tool.name));

      this.scene.add(card.group);
      this.timeline.tween(
        TOOL_BOLT_SECONDS,
        (k) => {
          card.group.position.lerpVectors(from, to, ease.inCubic(k));
          card.group.rotation.z = k * TOOL_BOLT_SPIN;
          this.rig.face(card.group, true);
        },
        () => {
          this.fx.beam(from, to, EVENT.partBeam);
          this.fx.burst(to, {
            n: PART_BURST_COUNT,
            colors: EVENT.partBreakBurst,
            speed: PART_BURST_SPEED,
          });
          this.fx.text(
            to.clone().add(new THREE.Vector3(0, PART_TEXT_RISE, 0)),
            beforeParen(tool.name)
              .split(" ")
              .slice(0, PART_TEXT_WORDS)
              .join(" "),
            EVENT.partText,
            PART_TEXT_SIZE,
            PART_TEXT_LIFE,
          );
          boss.breakPart(step.part, this.debris, from);
          this.sfx("bossPartBreak");
          this.street.bossLeft = this.street.bossTotal - step.part - 1;
          this.shake = PART_BREAK_SHAKE;
          card.dispose();
          this.timeline.untrack(card);

          const h0 = this.health;

          this.timeline.tween(PART_HEALTH_SECONDS, (k) => {
            this.health = lerp(h0, s.health, k);
          });
        },
      );
    });
  }

  private enterBossDown(_step: Step, s: State) {
    if (this.player === "p1") {
      this.reconcile({ ...s, pile: false });

      // Spaghetti rains down and buries them.
      const pile = makePile();

      this.street.pile = pile;
      this.scene.add(pile);
      pile.position.set(0, PILE_DROP_HEIGHT, s.z);
      this.timeline.tween(
        PILE_DROP_SECONDS,
        (k) => {
          pile.position.y = PILE_DROP_HEIGHT * (1 - ease.outCubic(k));
        },
        () => {
          this.shake = PILE_LANDING_SHAKE;
          this.fx.burst(pile.position.clone().setY(PILE_DUST_Y), {
            n: PILE_BURST_COUNT,
            colors: EVENT.bossDownBurst,
            speed: PILE_BURST_SPEED,
          });
        },
      );
      this.timeline.after(PILE_LOSE_SOUND_DELAY, () =>
        this.sfx("lose", PILE_LOSE_VOLUME),
      );

      return;
    }

    this.reconcile({
      ...s,
      boss: "alive",
      broken: this.street.bossTotal,
      pose: "aim",
    });

    const boss = this.street.bossModel;

    this.street.bossLeft = 0;
    this.timeline.after(FINISH_FIRE_DELAY, () => {
      this.character.fire();

      const from = this.character.muzzleWorld();
      const to = boss.core.group.getWorldPosition(new THREE.Vector3());

      this.fx.beam(from, to, EVENT.bossDownBeam);
      boss.core.crack(CORE_CRACK_SEED_FIRST);
      this.sfx("glassCrack");
    });
    this.timeline.after(CORE_CRACKS_DELAY, () => {
      boss.core.crack(CORE_CRACK_SEED_B, CORE_CRACK_B_U, CORE_CRACK_B_V);
      boss.core.crack(CORE_CRACK_SEED_C, CORE_CRACK_C_U, CORE_CRACK_C_V);
      boss.shake = 1;
    });
    this.timeline.after(BOSS_DESTROY_DELAY, () => {
      const at = boss.core.group.getWorldPosition(new THREE.Vector3());

      boss.destroy(this.debris, this.character.muzzleWorld().setY(0));
      this.street.boss = null;
      this.sfx("bossDefeat");
      this.sfx("shatter");
      this.shake = BOSS_DEFEAT_SHAKE;
      this.fx.confetti(at, BOSS_CONFETTI_COUNT);
      this.fx.ring(
        at,
        EVENT.bossDownRing,
        BOSS_RING_SIZE,
        BOSS_RING_LIFE,
        false,
        this.camera.position,
      );
      this.character.pose = "victory";
    });
    this.timeline.after(WIN_SOUND_DELAY, () => this.sfx("win"));
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

/** The tool card as a projectile: a small glowing yellow card. */
function toolBolt(name: string) {
  const group = new THREE.Group();
  const cv = document.createElement("canvas");

  cv.width = BOLT_WIDTH;
  cv.height = BOLT_HEIGHT;

  const g = context2d(cv);

  g.fillStyle = BOLT.card;
  g.beginPath();
  g.roundRect(0, 0, BOLT_WIDTH, BOLT_HEIGHT, BOLT_CORNER);
  g.fill();
  g.strokeStyle = BOLT.border;
  g.lineWidth = BOLT_BORDER;
  g.beginPath();
  g.roundRect(
    BOLT_INSET,
    BOLT_INSET,
    BOLT_INNER_WIDTH,
    BOLT_INNER_HEIGHT,
    BOLT_INNER_CORNER,
  );
  g.stroke();
  g.fillStyle = BOLT.text;
  g.font = "italic 800 46px Barlow, Impact, sans-serif";
  g.textAlign = "center";
  for (const [i, w] of beforeParen(name)
    .split(" ")
    .slice(0, BOLT_TEXT_LINES)
    .entries()) {
    g.fillText(w, BOLT_TEXT_X, BOLT_TEXT_TOP + i * BOLT_TEXT_LINE);
  }

  const tex = new THREE.CanvasTexture(cv);

  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, BOLT_PLANE_HEIGHT),
    mat,
  );

  group.add(mesh);

  const light = new THREE.PointLight(
    BOLT.light,
    BOLT_LIGHT_INTENSITY,
    BOLT_LIGHT_RANGE,
  );

  group.add(light);

  return {
    group,
    dispose: () => {
      tex.dispose();
      mat.dispose();
      mesh.geometry.dispose();
      group.removeFromParent();
    },
  };
}
