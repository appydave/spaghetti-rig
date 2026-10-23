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
import { healthAt, partsBroken, type Player, type Step } from "../show/script";
import { AutoGunner } from "./autogunner";
import { BossModel } from "./boss";
import type { BossLayout } from "./bosslayout";
import { CameraRig, type ShotView } from "./camera-rig";
import { Character } from "./characters";
import { buildCity, SEGMENT } from "./city";
import { CodeWindow } from "./codewindow";
import { Effects } from "./effects";
import { Enemy, SCORE, type EnemyKind } from "./enemies";
import { Gate } from "./gate";
import { makePile } from "./pile";
import { makeBossModel, makeStopWindow, paintStopCard } from "./tier-content";
import { Debris } from "./physics";
import { beforeParen } from "../ui/card";
import { clamp01, disposeTree, ease, lerp, rng } from "./toon";
import { BOLT, EVENT, WORLD } from "./palette";
import {
  BOSS,
  Cue,
  DEBT_WINDOW_COLS,
  KILL_TEXT_SIZE,
  RANDOM_CENTRE,
  State,
  Tween,
  standZ,
  stopZ,
} from "./world-shared";

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
const GUNNER_SEED_P1 = 11;
const GUNNER_SEED_P2 = 29;
const DEBRIS_BOUNCE_VOLUME_BASE = 0.3;
const DEBRIS_BOUNCE_VOLUME_SCALE = 0.5;
const RATTLE_P1 = 0.5;
const RATTLE_P2 = 0.3;
const DEBT_WINDOW_WIDTH = 1.1;
const CITY_TAIL_LENGTH = 40;
const CITY_SEED_BASE = 1000;
const CITY_SEED_PER_TIER = 77;
const CITY_CLEAR_BEHIND_ARENA = 16;
const CITY_CLEAR_AHEAD_OF_ARENA = 60;
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
const STREET_CLEAR_BURST_COUNT = 10;
const STREET_CLEAR_BURST_SPEED = 3;

const POINTER_FALLBACK_DISTANCE = 30;
const ENEMY_HIT_PADDING = 1.15;
const TRACER_WIDTH_P1 = 0.04;
const TRACER_WIDTH_P2 = 0.07;
const SHOT_VOLUME = 0.7;
const ENEMY_HIT_VOLUME = 0.6;
const ENEMY_HIT_BURST_COUNT = 12;
const ENEMY_HIT_BURST_SPEED = 5;
const GROUND_SPLASH_BELOW = 0.3;
const GROUND_SPLASH_Y = 0.05;
const MISS_BURST_COUNT = 5;
const BOSS_AIM_SPREAD_X = 3;
const BOSS_AIM_FRONT_Z = 0.6;
const BOUNCE_VOLUME = 0.8;
const BOUNCE_BURST_COUNT = 14;
const BOUNCE_BURST_SPEED = 6;
const BOUNCE_RING_SIZE = 0.8;
const BOUNCE_RING_LIFE = 0.25;
const BOUNCE_RISE_BASE = 3;
const BOUNCE_AWAY_BASE = 4;
const BOUNCE_AWAY_JITTER = 3;
const BOUNCE_TRACER_WIDTH = 0.03;
const NO_EFFECT_CHANCE = 0.6;
const NO_EFFECT_TEXT_SIZE = 0.7;
const NO_EFFECT_TEXT_LIFE = 0.9;
const ROBOT_KILL_BURST_COUNT = 50;
const KILL_BURST_COUNT = 30;
const KILL_BURST_SPEED = 8;
const KILL_RING_SIZE = 1.4;
const KILL_RING_LIFE = 0.35;
const KILL_DEBRIS_ORIGIN_LERP = 0.7;
const KILL_DEBRIS_POWER = 6;
const KILL_DEBRIS_UP = 5;
const KILL_DEBRIS_LIFE = 3.5;
const KILL_SHAKE = 0.25;
const AUTO_RANGE_NEAR = 3;
const AUTO_RANGE_FAR = 30;
const AUTO_REST_Y = 1.2;
const AUTO_REST_Z = -14;
const SLIP_TEXT_RISE = 1.1;
const SLIP_TEXT_AHEAD = 6;
const SLIP_TEXT_MAX_X = 3;
const SLIP_TEXT_LIFE = 1.2;
const SLIP_VOLUME = 0.5;
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
const SLIP_PAST_CHARACTER = 4;
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
  score = 0;
  /** Trigger pulls, from the mouse or autoplay. */
  shots = 0;
  /** Enemies that got past player 1: bugs shipped to production. */
  shipped = 0;
  /** An enemy got past: shipped (player 1) or caught by CI (player 2). */
  onSlip?: (kind: EnemyKind) => void;
  /** Health shown in the HUD (animated). */
  health = FULL_HEALTH;
  bossTotal = 0;
  bossLeft = 0;
  autoplay = false;

  private tier: PlayTier | null = null;
  private city: THREE.Group | null = null;
  private gates: Gate[] = [];
  private window: { win: CodeWindow; key: string; reading: boolean } | null =
    null;
  private debt: { win: CodeWindow; key: string }[] = [];
  private boss: BossModel | null = null;
  /** Kept after the boss breaks, so the camera holds its shot. */
  private bossLayout: BossLayout | null = null;
  private pile: THREE.Group | null = null;
  private enemies: Enemy[] = [];
  private temps: { dispose(): void }[] = [];
  private tweens: Tween[] = [];
  private cues: Cue[] = [];
  private clock = 0;
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
  private readonly gunner: AutoGunner;
  private aim: THREE.Vector3 | null = null;
  private autoTarget = -1;
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
    this.gunner = new AutoGunner(
      player === "p1" ? GUNNER_SEED_P1 : GUNNER_SEED_P2,
    );
    this.character = new Character(player);
    this.scene.add(this.character.root);
    this.fx = new Effects(this.scene);
    this.debris = new Debris(this.scene);
    this.debris.onBounce = (s) =>
      this.sfx(
        "debrisBounce",
        DEBRIS_BOUNCE_VOLUME_BASE + s * DEBRIS_BOUNCE_VOLUME_SCALE,
      );
  }

  /** The tier being played. Set when the first step builds it, so a step that needs it before then is a bug. */
  private get playing(): PlayTier {
    return present(this.tier, "the tier");
  }

  private get shownWindow() {
    return present(this.window, "the stop window");
  }

  private get bossModel(): BossModel {
    return present(this.boss, "the boss");
  }

  private gateAt(stop: number): Gate {
    return nth(this.gates, stop, "gates");
  }

  private sfx(name: Sfx, volume = 1) {
    this.audio.play(name, { pan: this.pan(), volume });
  }

  // ───────────────────────────── state ─────────────────────────────

  private stateFor(step: Step): State {
    const tier = nth(this.game.tiers, step.tier, "tiers");
    const n = tier.stops.length;
    const p1 = this.player === "p1";
    const hp = healthAt(this.game, step, this.player);
    const s: State = {
      tier: step.tier,
      z: 0,
      camera: "follow",
      window: "none",
      stop: -1,
      debt: 0,
      gates: tier.stops.map(() => "idle"),
      boss: "none",
      broken: 0,
      pose: "idle",
      pile: false,
      health: hp,
    };
    const passed = (k: number) => {
      for (let i = 0; i < k; i++) {
        s.gates[i] = p1 ? "broken" : "open";
      }
    };

    switch (step.phase) {
      case "vs":
        s.z = 0;
        s.camera = "portrait";
        break;
      case "walk":
        s.z = step.stop === 0 ? 0 : standZ(step.stop - 1);
        s.pose = "walk";
        passed(step.stop);
        s.debt = p1 ? step.stop : 0;
        break;
      case "problem":
      case "tool":
      case "fixed": {
        s.z = standZ(step.stop);
        s.camera = "stop";
        s.stop = step.stop;
        passed(step.stop);
        s.debt = p1 ? step.stop : 0;

        const fixed = step.phase === "fixed" && !p1;

        s.window = fixed ? "fixed" : "problem";
        s.gates[step.stop] = fixed ? "open" : "alarm";
        s.pose = p1 ? "hurt" : fixed ? "idle" : "aim";
        break;
      }

      default: {
        // Boss arena and after.
        s.z = standZ(n);
        s.camera = "boss";
        passed(n);
        s.debt = p1 ? n : 0;
        s.boss = "alive";
        s.broken = p1 ? 0 : partsBroken(step, tier);
        if (
          step.phase === "bossDown" ||
          step.phase === "result" ||
          step.phase === "ending"
        ) {
          s.boss = p1 ? "alive" : "dead";
        }

        s.pose = p1
          ? step.phase === "boss"
            ? "hurt"
            : "down"
          : step.phase === "boss" || step.phase === "bossPart"
            ? "aim"
            : "victory";
        s.pile = p1 && step.phase !== "boss" && step.phase !== "bossPart";
        if (step.phase === "result" || step.phase === "ending") {
          s.camera = "portrait";
        }

        if (p1 && (step.phase === "result" || step.phase === "ending")) {
          s.boss = "none";
        }

        if (!p1 && (step.phase === "result" || step.phase === "ending")) {
          s.boss = "dead";
        }
      }
    }

    return s;
  }

  /** Make the world match a state, reusing whatever already matches. */
  private reconcile(s: State) {
    this.clearAnimations();

    const tier = nth(this.game.tiers, s.tier, "tiers");

    if (this.tier !== tier) {
      this.buildTier(tier);
    }

    this.character.root.position.set(0, 0, s.z);
    this.character.root.rotation.y = 0;
    this.character.pose = s.pose;
    for (const [i, g] of s.gates.entries()) {
      const gate = this.gates[i];

      if (gate) {
        gate.state = g;
      }
    }

    // Stop window.
    const wantKey =
      s.window === "none" ? "" : `${s.stop}:${s.window}:${this.rig.shape}`;

    if ((this.window?.key ?? "") !== wantKey) {
      this.window?.win.dispose();
      this.window = null;
      if (wantKey) {
        const stop = nth(tier.stops, s.stop, "stops");
        const win = makeStopWindow(
          { game: this.game, tier },
          stop,
          s.window === "fixed" ? "fixed" : "problem",
          this.rig.shape,
        );

        this.scene.add(win.group);
        this.window = { win, key: wantKey, reading: true };
      }
    }

    if (this.window) {
      this.window.reading = true;
      this.window.win.rattle =
        s.window === "problem"
          ? this.player === "p1"
            ? RATTLE_P1
            : RATTLE_P2
          : 0;
    }

    // Tech debt trailing player 1.
    while (this.debt.length > s.debt) {
      this.debt.pop()?.win.dispose();
    }

    for (let k = this.debt.length; k < s.debt; k++) {
      const stop = nth(tier.stops, k, "stops");
      const win = new CodeWindow(
        paintStopCard(
          { game: this.game, tier },
          stop,
          "problem",
          DEBT_WINDOW_COLS,
        ),
        DEBT_WINDOW_WIDTH,
        "angry",
      );

      this.scene.add(win.group);
      this.debt.push({ win, key: String(k) });
    }

    // Boss.
    if (s.boss === "none" || s.boss === "dead") {
      this.boss?.dispose();
      this.boss = null;
    } else {
      if (
        !this.boss ||
        this.boss.remaining < tier.boss.parts.length - s.broken
      ) {
        this.boss?.dispose();
        this.boss = this.addBoss(tier);
      }

      for (let i = 0; i < s.broken; i++) {
        this.boss.dropPart(i);
      }

      this.boss.group.position.set(
        0,
        BOSS.y,
        s.z - this.rig.bossBack(present(this.bossLayout, "boss layout")),
      );
    }

    this.bossTotal = tier.hasBoss ? tier.boss.parts.length : 0;
    this.bossLeft = s.boss === "dead" ? 0 : this.bossTotal - s.broken;
    // Spaghetti burying player 1.
    if (s.pile && !this.pile) {
      this.pile = makePile();
      this.scene.add(this.pile);
    }

    if (!s.pile && this.pile) {
      disposeTree(this.pile);
      this.pile = null;
    }

    if (this.pile) {
      this.pile.position.set(0, 0, s.z);
    }

    this.health = s.health;
    this.rig.mode = s.camera;
    this.state = s;
  }

  private addBoss(tier: PlayTier): BossModel {
    const boss = makeBossModel(this.game, tier);

    this.bossLayout = boss.layout;
    this.scene.add(boss.group);

    return boss;
  }

  private clearAnimations() {
    this.tweens = [];
    this.cues = [];
    for (const t of this.temps) {
      t.dispose();
    }

    this.temps = [];
    this.walk = null;
  }

  private buildTier(tier: PlayTier) {
    if (this.city) {
      disposeTree(this.city);
    }

    for (const g of this.gates) {
      g.dispose();
    }

    this.window?.win.dispose();
    this.window = null;
    for (const d of this.debt) {
      d.win.dispose();
    }

    this.debt = [];
    this.boss?.dispose();
    this.boss = null;
    this.bossLayout = null;
    for (const e of this.enemies) {
      disposeTree(e.group);
    }

    this.enemies = [];
    this.debris.clear();
    this.fx.clear();

    const length = (tier.stops.length + 1) * SEGMENT + CITY_TAIL_LENGTH;
    // The boss stands in an open plaza beyond the last stop, so no building can hide any part of it.
    const arena = standZ(tier.stops.length);

    this.city = buildCity(
      length,
      CITY_SEED_BASE + tier.index * CITY_SEED_PER_TIER,
      tier.hasBoss
        ? {
            from: arena + CITY_CLEAR_BEHIND_ARENA,
            to: arena - CITY_CLEAR_AHEAD_OF_ARENA,
          }
        : undefined,
    );
    this.scene.add(this.city);
    this.gates = tier.stops.map((s, k) => {
      const g = new Gate(s.gate, stopZ(k));

      this.scene.add(g.group);

      return g;
    });
    this.tier = tier;
  }

  // ───────────────────────────── content → objects ─────────────────────────────

  // ───────────────────────────── stepping ─────────────────────────────

  /** Jump straight to a step's settled look (back, mode switch, tier jump). */
  settle(step: Step) {
    this.stepRef = step;
    this.reconcile(this.stateFor(step));
    if (step.phase === "walk") {
      this.character.pose = "idle";
    }
  }

  /** Play a step forward from the previous one. */
  enter(step: Step) {
    this.stepRef = step;

    const prevWindow = this.window;
    const keepWin =
      prevWindow && (step.phase === "walk" || step.phase === "boss");

    if (keepWin) {
      this.window = null;
    } // keep it alive for its exit animation

    const s = this.stateFor(step);

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

  private after(seconds: number, fn: () => void) {
    this.cues.push({ at: this.clock + seconds, fn });
  }

  private tween(dur: number, fn: (k: number) => void, done?: () => void) {
    this.tweens.push({ age: 0, dur, fn, done });
  }

  private track<T extends { dispose(): void }>(t: T) {
    this.temps.push(t);

    return t;
  }

  private exitWindow(w: { win: CodeWindow } | null) {
    if (!w) {
      return;
    }

    const win = w.win;
    const entry = this.track({ dispose: () => win.dispose() });
    const from = win.group.position.clone();
    const s0 = win.group.scale.x;
    const p1 = this.player === "p1";

    this.tween(
      EXIT_WINDOW_SECONDS,
      (k) => {
        const e = ease.inOutCubic(k);
        const to = p1
          ? this.debtSlot(this.debt.length - 1)
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
        this.temps.splice(this.temps.indexOf(entry), 1);
      },
    );
  }

  private startWalk(step: Step) {
    const tier = this.playing;
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

    this.enemies.push(e);
    this.scene.add(e.group);
  }

  private enterProblem(step: Step, s: State) {
    // Arrive with no window, then the angry card flies down the road and slams in.
    const before =
      this.player === "p1"
        ? healthAt(this.game, { ...step, phase: "walk" }, "p1")
        : FULL_HEALTH;

    this.reconcile(s);
    this.clearStreet();

    const w = this.shownWindow;

    w.reading = false;

    const g = w.win.group;

    g.visible = false;
    this.health = before;
    this.gateAt(step.stop).state = "idle";
    this.character.pose = "idle";
    this.after(PROBLEM_ALARM_DELAY, () => {
      this.gateAt(step.stop).state = "alarm";
    });

    const launch = CARD_LAUNCH_DELAY;
    const flight = CARD_FLIGHT_SECONDS;

    this.after(launch, () => {
      g.visible = true;

      const start = this.character.root.position
        .clone()
        .add(new THREE.Vector3(0, CARD_LAUNCH_Y, CARD_LAUNCH_Z));
      const chest = this.character.chestWorld();

      this.tween(flight, (k) => {
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
    this.after(launch + flight, () => {
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
        `−${Math.round(TIER_HEALTH_LOSS / this.playing.stops.length)}%`,
        EVENT.hitText,
        1.0,
        HIT_TEXT_LIFE,
      );

      const from = this.health;

      this.tween(HEALTH_DROP_SECONDS, (k) => {
        this.health = lerp(from, s.health, ease.outCubic(k));
      });
      this.character.pose = s.pose;

      // Bounce back into the reading spot.
      const hitPos = g.position.clone();
      const hitScale = g.scale.x;

      this.tween(
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

    const stop = nth(this.playing.stops, step.stop, "stops");
    const fixed = this.shownWindow;

    if (this.player === "p1") {
      return;
    }

    fixed.reading = true;
    fixed.win.group.visible = false;

    const old = this.track(
      makeStopWindow(
        { game: this.game, tier: this.playing },
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
    this.health = FULL_HEALTH - TIER_HEALTH_LOSS / this.playing.stops.length;
    this.gateAt(step.stop).state = "alarm";
    this.character.pose = "aim";
    this.after(AIM_TO_FIRE_DELAY, () => {
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
    this.after(FIRST_CRACK_DELAY, () => {
      old.crack(FIRST_CRACK_SEED);
      this.sfx("glassCrack");
    });
    this.after(MORE_CRACKS_DELAY, () => {
      old.crack(SECOND_CRACK_SEED, SECOND_CRACK_U, SECOND_CRACK_V);
      old.crack(THIRD_CRACK_SEED, THIRD_CRACK_U, THIRD_CRACK_V);
    });
    this.after(SHATTER_DELAY, () => {
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
      this.temps.splice(this.temps.indexOf(old), 1);
      this.shake = SHATTER_SHAKE;
    });
    this.after(FIXED_CARD_DELAY, () => {
      this.sfx("codeFix");
      fixed.win.group.visible = true;

      const g = fixed.win.group;

      fixed.reading = false;
      this.tween(
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
      this.gateAt(step.stop).state = "open";
    });
    this.after(HEAL_DELAY, () => {
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

      this.tween(HEAL_SECONDS, (k) => {
        this.health = lerp(from, FULL_HEALTH, ease.outCubic(k));
      });
      this.character.pose = "victory";
      this.after(VICTORY_POSE_SECONDS, () => {
        this.character.pose = "idle";
      });
    });
  }

  private enterBoss(s: State) {
    this.clearStreet();

    const boss = this.bossModel;
    const home = boss.group.position.clone();

    boss.group.position.y = home.y + BOSS_DROP_HEIGHT;
    this.after(BOSS_ARRIVE_SOUND_DELAY, () => this.sfx("bossArrive"));
    this.tween(
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
    this.tween(MIN_TWEEN_SECONDS, () => void 0);
    if (this.player === "p1") {
      // Player 1 has nothing that works: shots bounce off.
      for (const t of [
        BOSS_BOUNCE_SHOT_A,
        BOSS_BOUNCE_SHOT_B,
        BOSS_BOUNCE_SHOT_C,
      ]) {
        this.after(t, () => this.shootBoss());
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
      this.after(PART_SHOT_A_DELAY, () => this.shootBoss());
      this.after(PART_SHOT_B_DELAY, () => this.shootBoss());
      if (step.part === 0) {
        // The boss finishes player 1 with one blow.
        this.after(KO_BLOW_DELAY, () => {
          const firstStop = nth(this.playing.stops, 0, "stops");
          const blow = this.track(
            new CodeWindow(
              paintStopCard(
                { game: this.game, tier: this.playing },
                firstStop,
                "problem",
                DEBT_WINDOW_COLS,
              ),
              KO_BLOW_WIDTH,
              "angry",
            ),
          );

          this.scene.add(blow.group);

          const from = this.bossModel.partWorld(0);
          const to = this.character.chestWorld();

          this.tween(
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
              this.temps.splice(this.temps.indexOf(blow), 1);

              const h0 = this.health;

              this.tween(KO_HEALTH_SECONDS, (k) => {
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

    const boss = this.bossModel;

    this.bossLeft = this.bossTotal - step.part;

    const part = nth(this.playing.boss.parts, step.part, "boss parts");
    const tool = toolFor(this.game, part.beatenBy);

    this.after(TOOL_FIRE_DELAY, () => {
      this.character.fire();

      const from = this.character.muzzleWorld();
      const to = boss.partWorld(step.part);

      this.fx.muzzle(from, EVENT.partMuzzle);
      this.sfx("cardPlay");

      const card = this.track(toolBolt(tool.name));

      this.scene.add(card.group);
      this.tween(
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
          this.bossLeft = this.bossTotal - step.part - 1;
          this.shake = PART_BREAK_SHAKE;
          card.dispose();
          this.temps.splice(this.temps.indexOf(card), 1);

          const h0 = this.health;

          this.tween(PART_HEALTH_SECONDS, (k) => {
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

      this.pile = pile;
      this.scene.add(pile);
      pile.position.set(0, PILE_DROP_HEIGHT, s.z);
      this.tween(
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
      this.after(PILE_LOSE_SOUND_DELAY, () =>
        this.sfx("lose", PILE_LOSE_VOLUME),
      );

      return;
    }

    this.reconcile({
      ...s,
      boss: "alive",
      broken: this.bossTotal,
      pose: "aim",
    });

    const boss = this.bossModel;

    this.bossLeft = 0;
    this.after(FINISH_FIRE_DELAY, () => {
      this.character.fire();

      const from = this.character.muzzleWorld();
      const to = boss.core.group.getWorldPosition(new THREE.Vector3());

      this.fx.beam(from, to, EVENT.bossDownBeam);
      boss.core.crack(CORE_CRACK_SEED_FIRST);
      this.sfx("glassCrack");
    });
    this.after(CORE_CRACKS_DELAY, () => {
      boss.core.crack(CORE_CRACK_SEED_B, CORE_CRACK_B_U, CORE_CRACK_B_V);
      boss.core.crack(CORE_CRACK_SEED_C, CORE_CRACK_C_U, CORE_CRACK_C_V);
      boss.shake = 1;
    });
    this.after(BOSS_DESTROY_DELAY, () => {
      const at = boss.core.group.getWorldPosition(new THREE.Vector3());

      boss.destroy(this.debris, this.character.muzzleWorld().setY(0));
      this.boss = null;
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
    this.after(WIN_SOUND_DELAY, () => this.sfx("win"));
  }

  /** Tidy the street when a stop begins: remaining enemies poof away. */
  private clearStreet() {
    for (const e of this.enemies) {
      this.fx.burst(e.center(), {
        n: STREET_CLEAR_BURST_COUNT,
        colors: EVENT.clearStreetBurst,
        speed: STREET_CLEAR_BURST_SPEED,
      });
      disposeTree(e.group);
    }

    this.enemies = [];
  }

  // ───────────────────────────── shooting ─────────────────────────────

  /** Aim at a point on screen (normalised device coords); fire if asked. Returns true when something was hit. */
  pointer(ndc: THREE.Vector2 | null, fire: boolean): boolean {
    if (!ndc) {
      this.aim = null;

      return false;
    }

    const ray = new THREE.Raycaster();

    ray.setFromCamera(ndc, this.camera);

    const hit = this.pick(ray.ray);
    const point =
      hit?.point ?? ray.ray.at(POINTER_FALLBACK_DISTANCE, new THREE.Vector3());

    this.aim = point;
    if (fire) {
      this.fireAt(point, hit?.enemy ?? null, hit?.boss ?? false);
    }

    return !!hit;
  }

  private pick(
    ray: THREE.Ray,
  ): { point: THREE.Vector3; enemy?: Enemy; boss?: boolean } | null {
    let best: { point: THREE.Vector3; enemy?: Enemy; boss?: boolean } | null =
      null;
    let bestD = Infinity;
    const c = new THREE.Vector3();

    for (const e of this.enemies) {
      e.center(c);

      const sphere = new THREE.Sphere(c, e.radius * ENEMY_HIT_PADDING);
      const p = ray.intersectSphere(sphere, new THREE.Vector3());

      if (p) {
        const d = p.distanceTo(ray.origin);

        if (d < bestD) {
          bestD = d;
          best = { point: p, enemy: e };
        }
      }
    }

    if (this.boss && !best) {
      const box = new THREE.Box3().setFromObject(this.boss.core.group);
      const p = ray.intersectBox(box, new THREE.Vector3());

      if (p) {
        best = { point: p, boss: true };
      }
    }

    return best;
  }

  private fireAt(point: THREE.Vector3, enemy: Enemy | null, boss: boolean) {
    const from = this.character.muzzleWorld();

    this.character.fire();
    this.shots++;

    const p1 = this.player === "p1";

    this.fx.muzzle(from, p1 ? EVENT.muzzleP1 : EVENT.muzzleP2);
    this.fx.tracer(
      from,
      point,
      p1 ? EVENT.tracerP1 : EVENT.tracerP2,
      p1 ? TRACER_WIDTH_P1 : TRACER_WIDTH_P2,
    );
    this.sfx(p1 ? "shootP1" : "shoot", SHOT_VOLUME);
    if (enemy) {
      this.sfx("enemyHit", ENEMY_HIT_VOLUME);
      this.fx.burst(point, {
        n: ENEMY_HIT_BURST_COUNT,
        speed: ENEMY_HIT_BURST_SPEED,
      });
      if (enemy.hit()) {
        this.kill(enemy, from);
      }
    } else if (boss) {
      if (p1 || this.boss) {
        this.bounce(point);
      }
    } else {
      this.fx.burst(
        point.y < GROUND_SPLASH_BELOW ? point.setY(GROUND_SPLASH_Y) : point,
        {
          n: MISS_BURST_COUNT,
          speed: 2,
          colors: EVENT.shotBurst,
        },
      );
    }
  }

  private shootBoss() {
    if (!this.boss) {
      return;
    }

    const to = this.boss.core.group
      .getWorldPosition(new THREE.Vector3())
      .add(
        new THREE.Vector3(
          (Math.random() - RANDOM_CENTRE) * BOSS_AIM_SPREAD_X,
          (Math.random() - RANDOM_CENTRE) * 2,
          BOSS_AIM_FRONT_Z,
        ),
      );

    this.character.aimAt(to);
    this.fireAt(to, null, true);
  }

  /** A useless shot bounces off with a plink. */
  private bounce(at: THREE.Vector3) {
    this.sfx("bounce", BOUNCE_VOLUME);
    this.fx.burst(at, {
      n: BOUNCE_BURST_COUNT,
      colors: EVENT.bounceBurst,
      speed: BOUNCE_BURST_SPEED,
    });
    this.fx.ring(
      at,
      EVENT.bounceRing,
      BOUNCE_RING_SIZE,
      BOUNCE_RING_LIFE,
      false,
      this.camera.position,
    );

    const back = at
      .clone()
      .add(
        new THREE.Vector3(
          Math.random() * 2,
          BOUNCE_RISE_BASE + Math.random() * 2,
          BOUNCE_AWAY_BASE + Math.random() * BOUNCE_AWAY_JITTER,
        ),
      );

    this.fx.tracer(at, back, EVENT.bounceTracer, BOUNCE_TRACER_WIDTH);
    if (Math.random() < NO_EFFECT_CHANCE) {
      this.fx.text(
        at.clone().add(new THREE.Vector3(0, 1, 0)),
        "NO EFFECT",
        EVENT.noEffectText,
        NO_EFFECT_TEXT_SIZE,
        NO_EFFECT_TEXT_LIFE,
      );
    }
  }

  private kill(e: Enemy, from: THREE.Vector3) {
    const at = e.center();

    this.enemies.splice(this.enemies.indexOf(e), 1);
    this.score += SCORE[e.kind];
    this.sfx(e.kind === "robot" ? "robotBreak" : "enemyPop");
    this.fx.burst(at, {
      n: e.kind === "robot" ? ROBOT_KILL_BURST_COUNT : KILL_BURST_COUNT,
      speed: KILL_BURST_SPEED,
      colors:
        e.kind === "spaghetti"
          ? EVENT.killSpaghettiBurst
          : e.kind === "bug"
            ? EVENT.killBugBurst
            : EVENT.killRobotBurst,
    });
    this.fx.ring(
      at,
      EVENT.killRing,
      KILL_RING_SIZE,
      KILL_RING_LIFE,
      false,
      this.camera.position,
    );
    this.fx.text(
      at.clone().add(new THREE.Vector3(0, 1, 0)),
      `+${SCORE[e.kind]}`,
      EVENT.killText,
      KILL_TEXT_SIZE,
      1,
    );
    this.debris.breakObject(e.group, {
      from: from.clone().lerp(at, KILL_DEBRIS_ORIGIN_LERP),
      power: KILL_DEBRIS_POWER,
      up: KILL_DEBRIS_UP,
      life: KILL_DEBRIS_LIFE,
    });
    this.shake = Math.max(this.shake, KILL_SHAKE);
  }

  /** Autoplay: a seeded hand that drifts onto the nearest enemy ahead and fires like a person would. */
  private autoShoot(dt: number) {
    const me = this.character.root.position;
    const ahead = (e: Enemy) =>
      e.group.position.z < me.z - AUTO_RANGE_NEAR &&
      e.group.position.z > me.z - AUTO_RANGE_FAR;
    // Stay on the current target while it is still there; otherwise take the nearest one ahead.
    let target = this.enemies.find(
      (e) => e.seed === this.autoTarget && ahead(e),
    );

    target ??= this.enemies
      .filter(ahead)
      .sort((a, b) => b.group.position.z - a.group.position.z)[0];
    this.autoTarget = target?.seed ?? -1;

    const rest = me.clone().add(new THREE.Vector3(0, AUTO_REST_Y, AUTO_REST_Z));
    const shot = this.gunner.update(
      dt,
      target
        ? { id: target.seed, centre: target.center(), radius: target.radius }
        : null,
      rest,
    );

    this.aim = this.gunner.aim;
    if (!shot) {
      return;
    }

    // Where the hand points is where the shot goes: a pulled shot really misses.
    const dir = shot.at.clone().sub(this.camera.position).normalize();
    const hit = this.pick(new THREE.Ray(this.camera.position.clone(), dir));

    this.fireAt(hit?.point ?? shot.at, hit?.enemy ?? null, false);
  }

  /** An enemy reached the end of its path alive. */
  private slip(e: Enemy) {
    // Enemies often slip past right beside the camera; say it a few steps up the road instead.
    const at = e.center().add(new THREE.Vector3(0, SLIP_TEXT_RISE, 0));

    at.z = Math.min(at.z, this.character.root.position.z - SLIP_TEXT_AHEAD);
    at.x = THREE.MathUtils.clamp(at.x, -SLIP_TEXT_MAX_X, SLIP_TEXT_MAX_X);
    if (this.player === "p1") {
      this.shipped++;
      this.fx.text(
        at,
        "BUG SHIPPED",
        EVENT.shippedText,
        KILL_TEXT_SIZE,
        SLIP_TEXT_LIFE,
      );
      this.sfx("bounce", SLIP_VOLUME);
    } else {
      this.fx.text(
        at,
        "CAUGHT BY CI",
        EVENT.caughtText,
        KILL_TEXT_SIZE,
        SLIP_TEXT_LIFE,
      );
    }

    this.onSlip?.(e.kind);
  }

  /** Autoplay's aim on screen (normalised device coords), for its reticle. */
  autoAimScreen(): THREE.Vector2 | null {
    if (!this.autoplay || !this.walk || !this.gunner.aim) {
      return null;
    }

    const p = this.gunner.aim.clone().project(this.camera);

    return p.z < 1 ? new THREE.Vector2(p.x, p.y) : null;
  }

  // ───────────────────────────── per frame ─────────────────────────────

  private debtSlot(i: number) {
    const c = this.character.root.position;
    const t = this.clock;

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

    if (this.boss && this.state) {
      this.boss.group.position.z =
        this.state.z -
        this.rig.bossBack(present(this.bossLayout, "boss layout"));
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
      layout: this.bossLayout,
      window: this.window?.win ?? null,
      pile: this.pile !== null,
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
    const right = this.city?.getObjectByName("city-right");
    const ahead = this.rig.mode === "follow" || this.rig.mode === "boss";

    if (right) {
      right.visible = ahead;
    }

    for (const g of this.gates) {
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
    this.clock += dt;
    for (const cue of this.cues.filter((c) => c.at <= this.clock)) {
      this.cues.splice(this.cues.indexOf(cue), 1);
      cue.fn();
    }

    // Iterate a snapshot: finished tweens are spliced out of the live list inside the loop.
    const tweenSnapshot = this.tweens.slice();

    for (const t of tweenSnapshot) {
      t.age += dt;

      const k = Math.min(1, t.age / t.dur);

      t.fn(k);
      if (k >= 1) {
        this.tweens.splice(this.tweens.indexOf(t), 1);
        t.done?.();
      }
    }

    this.shake = Math.max(0, this.shake - dt * SHAKE_DECAY);

    const me = this.character.root.position;
    // Iterate a snapshot: enemies that got past are spliced out of the live list inside the loop.
    const enemySnapshot = this.enemies.slice();

    for (const e of enemySnapshot) {
      e.update(dt, this.camera.position);
      if (e.finished || e.group.position.z > me.z + SLIP_PAST_CHARACTER) {
        this.slip(e);
        disposeTree(e.group);
        this.enemies.splice(this.enemies.indexOf(e), 1);
      }
    }

    if (this.autoplay && this.walk) {
      this.autoShoot(dt);
    }

    this.character.aimAt(this.aim);
    if (
      this.walk &&
      Math.floor(this.clock * STEP_RATE) !==
        Math.floor((this.clock - dt) * STEP_RATE)
    ) {
      this.sfx("step", STEP_VOLUME);
    }

    this.character.update(dt);
    for (const g of this.gates) {
      g.update(dt);
    }

    this.updateCamera(dt);
    if (this.window) {
      const w = this.window;

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
          Math.sin(this.clock * READING_BOB_SPEED) * READING_BOB_HEIGHT;
      }

      w.win.update(dt);
    }

    for (const [i, d] of this.debt.entries()) {
      // The result shot shows the spaghetti pile instead; the trailing cards would cover the stamp.
      d.win.group.visible =
        this.rig.mode !== "portrait" && this.rig.mode !== "boss";
      d.win.group.position.lerp(
        this.debtSlot(i),
        1 - Math.exp(-dt * DEBT_EASE_RATE),
      );
      this.rig.face(d.win.group);
      d.win.group.rotateZ(
        Math.sin(this.clock * DEBT_WOBBLE_SPEED + i) * DEBT_WOBBLE,
      );
      d.win.update(dt);
    }

    if (this.boss) {
      this.boss.update(dt);
      this.boss.group.lookAt(
        this.camera.position.x,
        this.boss.group.position.y,
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
    return this.enemies.length;
  }

  get debrisCount() {
    return this.debris.count;
  }

  /** For tests: screen-space centre of the first enemy, if any. */
  enemyScreen(): THREE.Vector2 | null {
    const e = this.enemies[0];

    if (!e) {
      return null;
    }

    const p = e.center().project(this.camera);

    return new THREE.Vector2(p.x, p.y);
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
