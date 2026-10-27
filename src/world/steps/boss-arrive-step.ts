// The boss arrives (G04 W6): it drops from the sky, lands with dust and a shake, and player 1's shots bounce off it. Moved out of world.ts
// as it was, over the step context.
import type { StepContext } from "#root/src/world/steps/step-context.ts";
import { clamp01, ease } from "#root/src/world/models/toon.ts";
import { EVENT } from "#root/src/world/palette.ts";

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

export function enterBoss(c: StepContext) {
  c.combat.clearStreet();

  const boss = c.street.bossModel;
  const home = boss.group.position.clone();

  boss.group.position.y = home.y + BOSS_DROP_HEIGHT;
  c.timeline.after(BOSS_ARRIVE_SOUND_DELAY, () => c.sfx("bossArrive"));
  c.timeline.tween(
    BOSS_DROP_SECONDS,
    (k) => {
      boss.group.position.y =
        home.y + BOSS_DROP_HEIGHT * (1 - ease.outCubic(clamp01(k)));
    },
    () => {
      c.setShake(BOSS_LANDING_SHAKE);
      boss.shake = 1;
      c.fx.burst(home.clone().setY(BOSS_LANDING_DUST_Y), {
        n: BOSS_LANDING_BURST_COUNT,
        colors: EVENT.bossArriveBurst,
        speed: BOSS_LANDING_BURST_SPEED,
      });
    },
  );
  c.timeline.tween(MIN_TWEEN_SECONDS, () => void 0);
  if (c.player === "p1") {
    // Player 1 has nothing that works: shots bounce off.
    for (const t of [
      BOSS_BOUNCE_SHOT_A,
      BOSS_BOUNCE_SHOT_B,
      BOSS_BOUNCE_SHOT_C,
    ]) {
      c.timeline.after(t, () => c.combat.shootBoss());
    }
  }
}
