// The problem step of a stop (G04 W5d): the angry card flies down the road and slams into the player, who loses health. Moved out of
// world.ts: enterProblem is split into its beats (the flight, the hit, the bounce back into the reading spot) and nothing else changes.
import * as THREE from "three";
import { FULL_HEALTH, TIER_HEALTH_LOSS } from "#root/src/content/load.ts";
import { healthAt, type Step } from "#root/src/content/script.ts";
import type {
  StepContext,
  StopWindow,
} from "#root/src/world/steps/step-context.ts";
import { ease, lerp } from "#root/src/world/models/toon.ts";
import { EVENT } from "#root/src/world/palette.ts";
import type { State } from "#root/src/world/world-shared.ts";

type ProblemContext = Pick<
  StepContext,
  | "camera"
  | "character"
  | "combat"
  | "fx"
  | "game"
  | "health"
  | "player"
  | "reconcile"
  | "rig"
  | "setHealth"
  | "setShake"
  | "sfx"
  | "street"
  | "timeline"
>;

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

export function enterProblem(c: ProblemContext, step: Step, s: State) {
  // Arrive with no window, then the angry card flies down the road and slams in.
  const before =
    c.player === "p1"
      ? healthAt(c.game, { ...step, phase: "walk" }, "p1")
      : FULL_HEALTH;

  c.reconcile(s);
  c.combat.clearStreet();

  const w = c.street.shownWindow;

  w.reading = false;

  const g = w.win.group;

  g.visible = false;
  c.setHealth(before);
  c.street.gateAt(step.stop).state = "idle";
  c.character.pose = "idle";
  c.timeline.after(PROBLEM_ALARM_DELAY, () => {
    c.street.gateAt(step.stop).state = "alarm";
  });

  const launch = CARD_LAUNCH_DELAY;
  const flight = CARD_FLIGHT_SECONDS;

  c.timeline.after(launch, () => {
    flyCard(c, g);
  });
  c.timeline.after(launch + flight, () => {
    slam(c, s, w);
  });
}

function flyCard(c: ProblemContext, g: THREE.Group) {
  g.visible = true;

  const start = c.character.root.position
    .clone()
    .add(new THREE.Vector3(0, CARD_LAUNCH_Y, CARD_LAUNCH_Z));
  const chest = c.character.chestWorld();

  c.timeline.tween(CARD_FLIGHT_SECONDS, (k) => {
    const e = ease.inCubic(k);

    g.position.lerpVectors(
      start,
      chest.clone().add(new THREE.Vector3(0, CARD_HIT_Y, CARD_HIT_Z)),
      e,
    );
    g.scale.setScalar(lerp(CARD_FLIGHT_START_SCALE, CARD_FLIGHT_END_SCALE, e));
    g.rotation.set(0, 0, (1 - e) * CARD_FLIGHT_SPIN);
    g.quaternion.premultiply(new THREE.Quaternion());
    c.rig.face(g);
  });
}

function slam(c: ProblemContext, s: State, w: StopWindow) {
  c.sfx("slam");
  c.sfx("damage", DAMAGE_VOLUME);
  c.character.hit();
  c.setShake(1);
  hitEffects(c);

  const from = c.health();

  c.timeline.tween(HEALTH_DROP_SECONDS, (k) => {
    c.setHealth(lerp(from, s.health, ease.outCubic(k)));
  });
  c.character.pose = s.pose;
  bounceBack(c, w);
}

function hitEffects(c: ProblemContext) {
  const chest = c.character.chestWorld();

  c.fx.burst(chest, {
    colors: EVENT.hitBurst,
    n: HIT_BURST_COUNT,
    speed: HIT_BURST_SPEED,
  });
  c.fx.ring(
    chest,
    EVENT.hitRing,
    HIT_RING_SIZE,
    HIT_RING_LIFE,
    false,
    c.camera.position,
  );
  c.fx.text(
    chest.clone().add(new THREE.Vector3(0, HIT_TEXT_RISE, 0)),
    `−${Math.round(TIER_HEALTH_LOSS / c.street.playing.stops.length)}%`,
    EVENT.hitText,
    1.0,
    HIT_TEXT_LIFE,
  );
}

/** Bounce back into the reading spot. */
function bounceBack(c: ProblemContext, w: StopWindow) {
  const g = w.win.group;
  const hitPos = g.position.clone();
  const hitScale = g.scale.x;

  c.timeline.tween(
    CARD_BOUNCE_SECONDS,
    (k) => {
      const e = ease.outBack(k);
      const target = c.rig.readingPose(w.win, c.character.root.position.z);

      g.position.lerpVectors(hitPos, target.pos, e);
      g.scale.setScalar(lerp(hitScale, target.scale, e));
      c.rig.face(g);
    },
    () => {
      w.reading = true;
    },
  );
}
