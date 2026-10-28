// A boss part breaks (G04 W6). Player 1's shots bounce off and, on the first part, the boss finishes them with one blow; player 2 fires the
// tool earned at that stop at the matching part. Moved out of world.ts: enterBossPart is split into its beats and nothing else changes.
import * as THREE from "three";
import { toolFor } from "#root/src/content/load.ts";
import { nth } from "#root/src/nth.ts";
import { beforeParen } from "#root/src/ui/card.ts";
import { healthAt, type Step } from "#root/src/show/script.ts";
import type { BossModel } from "#root/src/world/models/boss.ts";
import { CodeWindow } from "#root/src/world/code-window/codewindow.ts";
import { EVENT } from "#root/src/world/palette.ts";
import type { StepContext } from "#root/src/world/steps/step-context.ts";
import { paintStopCard } from "#root/src/world/tier-content.ts";
import { toolBolt } from "#root/src/world/combat/tool-bolt.ts";
import { ease, lerp } from "#root/src/world/models/toon.ts";
import { DEBT_WINDOW_COLS, type State } from "#root/src/world/world-shared.ts";

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

export function enterBossPart(c: StepContext, step: Step, s: State) {
  if (c.player === "p1") {
    hurtPlayerOne(c, step, s);

    return;
  }

  breakWithTool(c, step, s);
}

function hurtPlayerOne(c: StepContext, step: Step, s: State) {
  c.reconcile({
    ...s,
    pose: step.part === 0 ? "hurt" : "down",
    health:
      step.part === 0 ? healthAt(c.game, { ...step, phase: "boss" }, "p1") : 0,
  });
  c.timeline.after(PART_SHOT_A_DELAY, () => c.combat.shootBoss());
  c.timeline.after(PART_SHOT_B_DELAY, () => c.combat.shootBoss());
  if (step.part === 0) {
    // The boss finishes player 1 with one blow.
    c.timeline.after(KO_BLOW_DELAY, () => {
      throwBlow(c);
    });
  }
}

function throwBlow(c: StepContext) {
  const firstStop = nth(c.street.playing.stops, 0, "stops");
  const blow = c.timeline.track(
    new CodeWindow(
      paintStopCard(
        { game: c.game, tier: c.street.playing },
        firstStop,
        "problem",
        DEBT_WINDOW_COLS,
      ),
      KO_BLOW_WIDTH,
      "angry",
    ),
  );

  c.scene.add(blow.group);

  const from = c.street.bossModel.partWorld(0);
  const to = c.character.chestWorld();

  c.timeline.tween(
    KO_BLOW_SECONDS,
    (k) => {
      blow.group.position.lerpVectors(from, to, ease.inCubic(k));
      blow.group.rotation.z = k * KO_BLOW_SPIN;
    },
    () => {
      blowLands(c, blow, { from, to });
    },
  );
}

type Path = { from: THREE.Vector3; to: THREE.Vector3 };

function blowLands(c: StepContext, blow: CodeWindow, path: Path) {
  const { from, to } = path;

  c.sfx("slam");
  c.sfx("lose");
  c.setShake(KO_SHAKE);
  c.character.hit();
  c.character.pose = "down";
  c.fx.burst(to, {
    n: KO_BURST_COUNT,
    colors: EVENT.bossHitBurst,
    speed: KO_BURST_SPEED,
  });
  c.fx.text(
    to.clone().add(new THREE.Vector3(0, KO_TEXT_RISE, 0)),
    "K.O.",
    EVENT.koText,
    KO_TEXT_SIZE,
    KO_TEXT_LIFE,
  );
  blow.shatter(c.debris, from, KO_SHATTER_POWER, [
    KO_SHATTER_GRID_COLS,
    KO_SHATTER_GRID_ROWS,
  ]);
  c.timeline.untrack(blow);

  const h0 = c.health();

  c.timeline.tween(KO_HEALTH_SECONDS, (k) => {
    c.setHealth(lerp(h0, 0, k));
  });
}

/** What one tool shot at one boss part needs: the boss, which part, the tool's name and the health the player ends on. */
type ToolShot = {
  boss: BossModel;
  part: number;
  toolName: string;
  health: number;
};

function breakWithTool(c: StepContext, step: Step, s: State) {
  // Player 2 fires the tool earned at that stop at the matching part.
  c.reconcile({ ...s, broken: step.part });

  const boss = c.street.bossModel;

  const part = nth(c.street.playing.boss.parts, step.part, "boss parts");
  const tool = toolFor(c.game, part.beatenBy);
  const shot = {
    boss,
    part: step.part,
    toolName: tool.name,
    health: s.health,
  };

  c.timeline.after(TOOL_FIRE_DELAY, () => {
    fireTool(c, shot);
  });
}

function fireTool(c: StepContext, shot: ToolShot) {
  c.character.fire();

  const from = c.character.muzzleWorld();
  const to = shot.boss.partWorld(shot.part);

  c.fx.muzzle(from, EVENT.partMuzzle);
  c.sfx("cardPlay");

  const card = c.timeline.track(toolBolt(shot.toolName));

  c.scene.add(card.group);
  c.timeline.tween(
    TOOL_BOLT_SECONDS,
    (k) => {
      card.group.position.lerpVectors(from, to, ease.inCubic(k));
      card.group.rotation.z = k * TOOL_BOLT_SPIN;
      c.rig.face(card.group, true);
    },
    () => {
      partBreaks(c, shot, card, { from, to });
    },
  );
}

function partBreaks(
  c: StepContext,
  shot: ToolShot,
  card: ReturnType<typeof toolBolt>,
  path: Path,
) {
  const { from, to } = path;

  c.fx.beam(from, to, EVENT.partBeam);
  c.fx.burst(to, {
    n: PART_BURST_COUNT,
    colors: EVENT.partBreakBurst,
    speed: PART_BURST_SPEED,
  });
  c.fx.text(
    to.clone().add(new THREE.Vector3(0, PART_TEXT_RISE, 0)),
    beforeParen(shot.toolName).split(" ").slice(0, PART_TEXT_WORDS).join(" "),
    EVENT.partText,
    PART_TEXT_SIZE,
    PART_TEXT_LIFE,
  );
  shot.boss.breakPart(shot.part, c.debris, from);
  c.sfx("bossPartBreak");
  c.street.setBroken(shot.part + 1);
  c.setShake(PART_BREAK_SHAKE);
  card.dispose();
  c.timeline.untrack(card);

  const h0 = c.health();

  c.timeline.tween(PART_HEALTH_SECONDS, (k) => {
    c.setHealth(lerp(h0, shot.health, k));
  });
}
