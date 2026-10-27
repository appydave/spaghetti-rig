// The boss goes down (G04 W6). Player 1 is buried under spaghetti; player 2 shoots the boss's core, which cracks, and the boss is destroyed.
// Moved out of world.ts: enterBossDown is split into its two endings and nothing else changes.
import * as THREE from "three";
import type { BossModel } from "./boss";
import { EVENT } from "./palette";
import type { StepContext } from "./step-context";
import { ease } from "./toon";
import type { State } from "./world-shared";

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
const CORE_CRACK_SEED_SECOND = 17;
const CORE_CRACK_SECOND_U = 0.3;
const CORE_CRACK_SECOND_V = 0.4;
const CORE_CRACK_SEED_THIRD = 23;
const CORE_CRACK_THIRD_U = 0.7;
const CORE_CRACK_THIRD_V = 0.7;
const BOSS_DESTROY_DELAY = 1.1;
const BOSS_DEFEAT_SHAKE = 1.5;
const BOSS_CONFETTI_COUNT = 200;
const BOSS_RING_SIZE = 6;
const BOSS_RING_LIFE = 0.8;
const WIN_SOUND_DELAY = 1.6;

export function enterBossDown(c: StepContext, s: State) {
  if (c.player === "p1") {
    buryPlayerOne(c, s);

    return;
  }

  defeatBoss(c, s);
}

function buryPlayerOne(c: StepContext, s: State) {
  c.reconcile({ ...s, pile: false });

  // Spaghetti rains down and buries them.
  const pile = c.street.bury();

  pile.position.set(0, PILE_DROP_HEIGHT, s.z);
  c.timeline.tween(
    PILE_DROP_SECONDS,
    (k) => {
      pile.position.y = PILE_DROP_HEIGHT * (1 - ease.outCubic(k));
    },
    () => {
      c.setShake(PILE_LANDING_SHAKE);
      c.fx.burst(pile.position.clone().setY(PILE_DUST_Y), {
        n: PILE_BURST_COUNT,
        colors: EVENT.bossDownBurst,
        speed: PILE_BURST_SPEED,
      });
    },
  );
  c.timeline.after(PILE_LOSE_SOUND_DELAY, () =>
    c.sfx("lose", PILE_LOSE_VOLUME),
  );
}

function defeatBoss(c: StepContext, s: State) {
  c.reconcile({
    ...s,
    boss: "alive",
    broken: c.street.bossTotal,
    pose: "aim",
  });

  const boss = c.street.bossModel;

  c.timeline.after(FINISH_FIRE_DELAY, () => {
    c.character.fire();

    const from = c.character.muzzleWorld();
    const to = boss.core.group.getWorldPosition(new THREE.Vector3());

    c.fx.beam(from, to, EVENT.bossDownBeam);
    boss.core.crack(CORE_CRACK_SEED_FIRST);
    c.sfx("glassCrack");
  });
  c.timeline.after(CORE_CRACKS_DELAY, () => {
    boss.core.crack(
      CORE_CRACK_SEED_SECOND,
      CORE_CRACK_SECOND_U,
      CORE_CRACK_SECOND_V,
    );
    boss.core.crack(
      CORE_CRACK_SEED_THIRD,
      CORE_CRACK_THIRD_U,
      CORE_CRACK_THIRD_V,
    );
    boss.shake = 1;
  });
  c.timeline.after(BOSS_DESTROY_DELAY, () => {
    destroyBoss(c, boss);
  });
  c.timeline.after(WIN_SOUND_DELAY, () => c.sfx("win"));
}

function destroyBoss(c: StepContext, boss: BossModel) {
  const at = boss.core.group.getWorldPosition(new THREE.Vector3());

  c.street.defeat(c.debris, c.character.muzzleWorld().setY(0));
  c.sfx("bossDefeat");
  c.sfx("shatter");
  c.setShake(BOSS_DEFEAT_SHAKE);
  c.fx.confetti(at, BOSS_CONFETTI_COUNT);
  c.fx.ring(
    at,
    EVENT.bossDownRing,
    BOSS_RING_SIZE,
    BOSS_RING_LIFE,
    false,
    c.camera.position,
  );
  c.character.pose = "victory";
}
