// What a shot, a kill and a slipped enemy look and sound like (G04 W4): the bounce off the boss, the pop and debris of a kill, the
// "BUG SHIPPED" or "CAUGHT BY CI" text. Moved out of world.ts as it was; what they need from the world comes in as CombatDeps.
import * as THREE from "three";
import type { Sfx } from "#root/src/audio/audio.ts";
import type { Player } from "#root/src/show/script.ts";
import type { BossModel } from "#root/src/world/models/boss.ts";
import type { Character } from "#root/src/world/models/characters.ts";
import type { Effects } from "#root/src/world/effects.ts";
import { SCORE, type Enemy } from "#root/src/world/models/enemies.ts";
import { EVENT } from "#root/src/world/palette.ts";
import type { Debris } from "#root/src/world/physics.ts";
import { KILL_TEXT_SIZE } from "#root/src/world/world-shared.ts";

/** What the combat reaches for in the world around it. */
export interface CombatDeps {
  player: Player;
  camera: THREE.PerspectiveCamera;
  character: Character;
  fx: Effects;
  debris: Debris;
  sfx: (name: Sfx, volume?: number) => void;
  /** Shake the camera at least this hard. */
  shake: (atLeast: number) => void;
  boss: () => BossModel | null;
  autoplay: () => boolean;
  walking: () => boolean;
}

const TRACER_WIDTH_P1 = 0.04;
const TRACER_WIDTH_P2 = 0.07;
const SHOT_VOLUME = 0.7;
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
const SLIP_TEXT_RISE = 1.1;
const SLIP_TEXT_AHEAD = 6;
const SLIP_TEXT_MAX_X = 3;
const SLIP_TEXT_LIFE = 1.2;
const SLIP_VOLUME = 0.5;

/** What a player's gun looks and sounds like: the muzzle flash, the tracer and its width, and the shot sound. */
const GUN = {
  p1: {
    muzzle: EVENT.muzzleP1,
    tracer: EVENT.tracerP1,
    width: TRACER_WIDTH_P1,
    sound: "shootP1",
  },
  p2: {
    muzzle: EVENT.muzzleP2,
    tracer: EVENT.tracerP2,
    width: TRACER_WIDTH_P2,
    sound: "shoot",
  },
} as const;

/** The flash at the muzzle, the tracer to where the shot lands, and the bang. */
export function shootFx(d: CombatDeps, from: THREE.Vector3, to: THREE.Vector3) {
  const gun = GUN[d.player];

  d.fx.muzzle(from, gun.muzzle);
  d.fx.tracer(from, to, gun.tracer, gun.width);
  d.sfx(gun.sound, SHOT_VOLUME);
}

/** A useless shot bounces off with a plink. */
export function bounceFx(d: CombatDeps, at: THREE.Vector3) {
  d.sfx("bounce", BOUNCE_VOLUME);
  d.fx.burst(at, {
    n: BOUNCE_BURST_COUNT,
    colors: EVENT.bounceBurst,
    speed: BOUNCE_BURST_SPEED,
  });
  d.fx.ring(
    at,
    EVENT.bounceRing,
    BOUNCE_RING_SIZE,
    BOUNCE_RING_LIFE,
    false,
    d.camera.position,
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

  d.fx.tracer(at, back, EVENT.bounceTracer, BOUNCE_TRACER_WIDTH);
  if (Math.random() < NO_EFFECT_CHANCE) {
    d.fx.text(
      at.clone().add(new THREE.Vector3(0, 1, 0)),
      "NO EFFECT",
      EVENT.noEffectText,
      NO_EFFECT_TEXT_SIZE,
      NO_EFFECT_TEXT_LIFE,
    );
  }
}

export function killFx(
  d: CombatDeps,
  e: Enemy,
  from: THREE.Vector3,
  at: THREE.Vector3,
) {
  d.sfx(e.kind === "robot" ? "robotBreak" : "enemyPop");
  d.fx.burst(at, {
    n: e.kind === "robot" ? ROBOT_KILL_BURST_COUNT : KILL_BURST_COUNT,
    speed: KILL_BURST_SPEED,
    colors:
      e.kind === "spaghetti"
        ? EVENT.killSpaghettiBurst
        : e.kind === "bug"
          ? EVENT.killBugBurst
          : EVENT.killRobotBurst,
  });
  d.fx.ring(
    at,
    EVENT.killRing,
    KILL_RING_SIZE,
    KILL_RING_LIFE,
    false,
    d.camera.position,
  );
  d.fx.text(
    at.clone().add(new THREE.Vector3(0, 1, 0)),
    `+${SCORE[e.kind]}`,
    EVENT.killText,
    KILL_TEXT_SIZE,
    1,
  );
  d.debris.breakObject(e.group, {
    from: from.clone().lerp(at, KILL_DEBRIS_ORIGIN_LERP),
    power: KILL_DEBRIS_POWER,
    up: KILL_DEBRIS_UP,
    life: KILL_DEBRIS_LIFE,
  });
  d.shake(KILL_SHAKE);
}

/** An enemy reached the end of its path alive. */
export function slipFx(d: CombatDeps, e: Enemy) {
  // Enemies often slip past right beside the camera; say it a few steps up the road instead.
  const at = e.center().add(new THREE.Vector3(0, SLIP_TEXT_RISE, 0));

  at.z = Math.min(at.z, d.character.root.position.z - SLIP_TEXT_AHEAD);
  at.x = THREE.MathUtils.clamp(at.x, -SLIP_TEXT_MAX_X, SLIP_TEXT_MAX_X);
  if (d.player === "p1") {
    d.fx.text(
      at,
      "BUG SHIPPED",
      EVENT.shippedText,
      KILL_TEXT_SIZE,
      SLIP_TEXT_LIFE,
    );
    d.sfx("bounce", SLIP_VOLUME);
  } else {
    d.fx.text(
      at,
      "CAUGHT BY CI",
      EVENT.caughtText,
      KILL_TEXT_SIZE,
      SLIP_TEXT_LIFE,
    );
  }
}
