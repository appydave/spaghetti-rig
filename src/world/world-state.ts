// What a player's world looks like once a step has fully happened (G04 W5). A pure function of the game, the player and the step: it reads
// no world fields. Moved out of world.ts as it was, split by phase so each part stays within the function-length limit.
import { nth } from "#root/src/nth.ts";
import type { Game, PlayTier } from "#root/src/content/load.ts";
import {
  healthAt,
  partsBroken,
  type Phase,
  type Player,
  type Step,
} from "#root/src/show/script.ts";
import { standZ, type State } from "#root/src/world/world-shared.ts";

/** Mark the first k gates passed: broken for player 1, open for player 2. */
function passed(s: State, k: number, p1: boolean) {
  for (let i = 0; i < k; i++) {
    s.gates[i] = p1 ? "broken" : "open";
  }
}

function stopState(s: State, step: Step, p1: boolean) {
  s.z = standZ(step.stop);
  s.camera = "stop";
  s.stop = step.stop;
  passed(s, step.stop, p1);
  s.debt = p1 ? step.stop : 0;

  const fixed = step.phase === "fixed" && !p1;

  s.window = fixed ? "fixed" : "problem";
  s.gates[step.stop] = fixed ? "open" : "alarm";
  s.pose = p1 ? "hurt" : fixed ? "idle" : "aim";
}

const FIGHTING: ReadonlySet<Phase> = new Set(["boss", "bossPart"]);
const ENDED: ReadonlySet<Phase> = new Set(["result", "ending"]);

/** The boss once the arena is reached: player 2 beats it at bossDown, player 1 is buried and the boss leaves with the result. */
function bossStatus(phase: Phase, p1: boolean): State["boss"] {
  if (ENDED.has(phase)) {
    return p1 ? "none" : "dead";
  }

  return !p1 && phase === "bossDown" ? "dead" : "alive";
}

function bossPose(phase: Phase, p1: boolean): State["pose"] {
  if (p1) {
    return phase === "boss" ? "hurt" : "down";
  }

  return FIGHTING.has(phase) ? "aim" : "victory";
}

/** Boss arena and after. */
function bossState(s: State, step: Step, tier: PlayTier, p1: boolean) {
  const n = tier.stops.length;

  s.z = standZ(n);
  s.camera = ENDED.has(step.phase) ? "portrait" : "boss";
  passed(s, n, p1);
  s.debt = p1 ? n : 0;
  s.boss = bossStatus(step.phase, p1);
  s.broken = p1 ? 0 : partsBroken(step, tier);
  s.pose = bossPose(step.phase, p1);
  s.pile = p1 && !FIGHTING.has(step.phase);
}

export function stateFor(game: Game, player: Player, step: Step): State {
  const tier = nth(game.tiers, step.tier, "tiers");
  const p1 = player === "p1";
  const hp = healthAt(game, step, player);
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

  switch (step.phase) {
    case "vs":
      s.z = 0;
      s.camera = "portrait";
      break;
    case "walk":
      s.z = step.stop === 0 ? 0 : standZ(step.stop - 1);
      s.pose = "walk";
      passed(s, step.stop, p1);
      s.debt = p1 ? step.stop : 0;
      break;
    case "problem":
    case "tool":
    case "fixed":
      stopState(s, step, p1);
      break;
    default:
      bossState(s, step, tier, p1);
  }

  return s;
}
