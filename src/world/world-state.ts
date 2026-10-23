// What a player's world looks like once a step has fully happened (G04 W5). A pure function of the game, the player and the step: it reads
// no world fields. Moved out of world.ts as it was, split by phase so each part stays within the function-length limit.
import { nth } from "../nth";
import type { Game, PlayTier } from "../content/load";
import { healthAt, partsBroken, type Player, type Step } from "../show/script";
import { standZ, type State } from "./world-shared";

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

/** Boss arena and after. */
function bossState(s: State, step: Step, tier: PlayTier, p1: boolean) {
  const n = tier.stops.length;

  s.z = standZ(n);
  s.camera = "boss";
  passed(s, n, p1);
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
