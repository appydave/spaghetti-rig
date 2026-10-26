// The fixed step of a stop (G04 W5d): player 2's tool card shoots the old card, which cracks and shatters; the fixed card drops in and the
// health heals. Moved out of world.ts: enterFixed is split into its beats (the shot, the cracks, the shatter, the fixed card, the heal) and
// nothing else changes.
import * as THREE from "three";
import { FULL_HEALTH, TIER_HEALTH_LOSS } from "../content/load";
import { nth } from "../nth";
import type { Step } from "../show/script";
import type { StepContext, StopWindow } from "./step-context";
import { makeStopWindow } from "./tier-content";
import { ease, lerp } from "./toon";
import { EVENT } from "./palette";
import type { State } from "./world-shared";

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

type OldCard = ReturnType<typeof makeStopWindow>;

export function enterFixed(c: StepContext, step: Step, s: State) {
  c.reconcile(s);

  const stop = nth(c.street.playing.stops, step.stop, "stops");
  const fixed = c.street.shownWindow;

  if (c.player === "p1") {
    return;
  }

  fixed.reading = true;
  fixed.win.group.visible = false;

  const old = c.timeline.track(
    makeStopWindow(
      { game: c.game, tier: c.street.playing },
      stop,
      "problem",
      c.rig.shape,
    ),
  );

  old.rattle = OLD_CARD_RATTLE;
  c.scene.add(old.group);

  const pose = c.rig.readingPose(old, c.character.root.position.z);

  old.group.position.copy(pose.pos);
  old.group.scale.setScalar(pose.scale);
  c.rig.face(old.group);
  c.setHealth(FULL_HEALTH - TIER_HEALTH_LOSS / c.street.playing.stops.length);
  c.street.gateAt(step.stop).state = "alarm";
  c.character.pose = "aim";
  c.timeline.after(AIM_TO_FIRE_DELAY, () => {
    fireAt(c, old);
  });
  c.timeline.after(FIRST_CRACK_DELAY, () => {
    old.crack(FIRST_CRACK_SEED);
    c.sfx("glassCrack");
  });
  c.timeline.after(MORE_CRACKS_DELAY, () => {
    old.crack(SECOND_CRACK_SEED, SECOND_CRACK_U, SECOND_CRACK_V);
    old.crack(THIRD_CRACK_SEED, THIRD_CRACK_U, THIRD_CRACK_V);
  });
  c.timeline.after(SHATTER_DELAY, () => {
    shatter(c, old, step.stop);
  });
  c.timeline.after(FIXED_CARD_DELAY, () => {
    dropInFixedCard(c, fixed, step.stop);
  });
  c.timeline.after(HEAL_DELAY, () => {
    heal(c);
  });
}

function fireAt(c: StepContext, old: OldCard) {
  c.character.fire();

  const from = c.character.muzzleWorld();
  const to = old.group.position.clone();

  c.fx.muzzle(from, EVENT.toolMuzzle);
  c.fx.beam(from, to);
  c.fx.ring(
    to,
    EVENT.toolRing,
    BEAM_RING_SIZE,
    BEAM_RING_LIFE,
    false,
    c.camera.position,
  );
  c.sfx("cardPlay");
}

function shatter(c: StepContext, old: OldCard, stop: number) {
  c.sfx("shatter");

  const from = c.character.muzzleWorld();

  old.shatter(
    c.debris,
    from.setY(from.y - 1),
    SHATTER_POWER,
    c.rig.shape === "tall"
      ? [SHATTER_GRID_SHORT, SHATTER_GRID_LONG]
      : [SHATTER_GRID_LONG, SHATTER_GRID_SHORT],
    SHATTER_SEED_BASE + stop,
  );
  c.timeline.untrack(old);
  c.setShake(SHATTER_SHAKE);
}

function dropInFixedCard(c: StepContext, fixed: StopWindow, stop: number) {
  c.sfx("codeFix");
  fixed.win.group.visible = true;

  const g = fixed.win.group;

  fixed.reading = false;
  c.timeline.tween(
    FIXED_CARD_SECONDS,
    (k) => {
      const t = c.rig.readingPose(fixed.win, c.character.root.position.z);

      g.position
        .copy(t.pos)
        .add(new THREE.Vector3(0, (1 - ease.outBack(k)) * FIXED_CARD_DROP, 0));
      g.scale.setScalar(
        t.scale * lerp(FIXED_CARD_START_SCALE, 1, ease.outBack(k)),
      );
      c.rig.face(g);
    },
    () => {
      fixed.reading = true;
    },
  );
  c.street.gateAt(stop).state = "open";
}

function heal(c: StepContext) {
  c.sfx("heal");
  c.fx.heal(
    c.character.root.position.clone().add(new THREE.Vector3(0, HEAL_RISE, 0)),
  );
  c.fx.text(
    c.character.chestWorld().add(new THREE.Vector3(0, HEAL_TEXT_RISE, 0)),
    "+100% HP",
    EVENT.healText,
    1.0,
    HEAL_TEXT_LIFE,
  );

  const from = c.health();

  c.timeline.tween(HEAL_SECONDS, (k) => {
    c.setHealth(lerp(from, FULL_HEALTH, ease.outCubic(k)));
  });
  c.character.pose = "victory";
  c.timeline.after(VICTORY_POSE_SECONDS, () => {
    c.character.pose = "idle";
  });
}
