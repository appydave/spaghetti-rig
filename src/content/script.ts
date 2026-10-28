import {
  FULL_HEALTH,
  hitFor,
  type Game,
  type PlayTier,
} from "#root/src/content/load.ts";

/**
 * The show is a flat list of steps built from the content file. `→` moves forward, `←` back.
 * Everything a step looks like (health, which card is up, which tools are earned) is a pure
 * function of the step, so jumping, going back and switching modes always land in the same place.
 */
export type Phase =
  | "vs" // face-off screen for a tier
  | "walk" // walking to stop k, shooting street enemies
  | "problem" // stop k: the problem card has slammed into both players
  | "tool" // stop k: player 2's tool card is up
  | "fixed" // stop k: the card is played, player 2's code is the diff, health back to 100
  | "boss" // the boss has arrived
  | "bossPart" // player 2 has knocked off part `part`
  | "bossDown" // the boss is beaten (P2) / P1 buried
  | "result" // tier result
  | "ending"; // the two endings

export interface Step {
  phase: Phase;
  tier: number;
  stop: number;
  part: number;
}
/** p1 / p2: one player full screen. both: side by side. spec: side by side, you play the specialist and the vibe coder plays itself. */
export type Mode = "p1" | "p2" | "both" | "spec";
export const isSplit = (mode: Mode): mode is "both" | "spec" =>
  mode === "both" || mode === "spec";
export const MODES: {
  mode: Mode;
  key: string;
  code: string;
  hud: string;
  map: string;
}[] = [
  {
    mode: "p1",
    key: "1",
    code: "Digit1",
    hud: "PLAYER 1",
    map: "PLAYER 1 · VIBE CODER ONLY",
  },
  {
    mode: "both",
    key: "B",
    code: "KeyB",
    hud: "BOTH",
    map: "BOTH · SIDE BY SIDE",
  },
  {
    mode: "p2",
    key: "2",
    code: "Digit2",
    hud: "PLAYER 2",
    map: "PLAYER 2 · GATED ONLY",
  },
  {
    mode: "spec",
    key: "S",
    code: "KeyS",
    hud: "YOU VS AUTOPILOT",
    map: "YOU PLAY THE SPECIALIST · THE VIBE CODER PLAYS ITSELF",
  },
];

/** The label set for a mode; throws on a mode the list does not know. */
export function modeInfo(mode: Mode) {
  const info = MODES.find((m) => m.mode === mode);

  if (!info) {
    throw new Error(`Unknown mode "${mode}"`);
  }

  return info;
}

export type Player = "p1" | "p2";

/** The steps of one playable tier: the face-off, each stop's four steps, the boss and its parts if it has one, then the result. */
function tierSteps(t: PlayTier): Step[] {
  const steps: Step[] = [];
  const s = (phase: Phase, stop = -1, part = -1) =>
    steps.push({ phase, tier: t.index, stop, part });

  s("vs");
  for (const k of t.stops.keys()) {
    s("walk", k);
    s("problem", k);
    s("tool", k);
    s("fixed", k);
  }

  if (t.hasBoss) {
    s("walk", t.stops.length); // walk to the boss arena
    s("boss");
    for (const i of t.boss.parts.keys()) {
      s("bossPart", -1, i);
    }

    s("bossDown");
  }

  s("result");

  return steps;
}

export function buildScript(game: Game): Step[] {
  const playable = game.tiers.filter((t) => t.playable);
  const steps = playable.flatMap((t) => tierSteps(t));
  const lastPlayable = playable.at(-1);

  if (lastPlayable) {
    steps.push({
      phase: "ending",
      tier: lastPlayable.index,
      stop: -1,
      part: -1,
    });
  }

  return steps;
}

/** Player 1 never gets a tool card, so in player-1 mode those steps are passed over. */
export const hiddenIn = (step: Step, mode: Mode) =>
  mode === "p1" && (step.phase === "tool" || step.phase === "fixed");

export function nextIndex(
  script: Step[],
  at: number,
  dir: 1 | -1,
  mode: Mode,
): number {
  let i = at + dir;

  for (let step = script[i]; step && hiddenIn(step, mode); step = script[i]) {
    i += dir;
  }

  return i < 0 || i >= script.length ? at : i;
}

export const tierStart = (script: Step[], tierIndex: number) =>
  script.findIndex((s) => s.phase === "vs" && s.tier === tierIndex);

/** Health is kept to one decimal: values are rounded to this many tenths. */
const TENTHS = 10;

/** Health in percent for a player at a step (the settled value once the step's action has happened). */
export function healthAt(game: Game, step: Step, player: Player): number {
  if (step.phase === "ending") {
    return player === "p1" ? 0 : FULL_HEALTH;
  }

  const tier = game.tiers[step.tier];

  if (!tier) {
    return FULL_HEALTH;
  }

  const hit = hitFor(tier);
  const n = tier.stops.length;
  const round = (v: number) => Math.max(0, Math.round(v * TENTHS) / TENTHS);

  if (player === "p1") {
    switch (step.phase) {
      case "vs":
        return FULL_HEALTH;
      case "walk":
        return round(FULL_HEALTH - Math.min(step.stop, n) * hit);
      case "problem":
      case "tool":
      case "fixed":
        return round(FULL_HEALTH - (step.stop + 1) * hit);
      case "boss":
        return round(FULL_HEALTH - n * hit);
      default:
        return 0; // the boss finishes player 1 with its first blow
    }
  }

  switch (step.phase) {
    case "problem":
    case "tool":
      return round(FULL_HEALTH - hit);
    case "boss":
      return round(FULL_HEALTH - hit);
    case "bossPart": {
      const parts = Math.max(1, tier.boss.parts.length);

      return round(FULL_HEALTH - hit * (1 - (step.part + 1) / parts));
    }

    default:
      return FULL_HEALTH;
  }
}

/** How many of the tier's stops are fixed by this step: the ones before a stop's walk and cards, and that stop too once it is fixed. */
function stopsDone(step: Step, tier: PlayTier): number {
  switch (step.phase) {
    case "walk":
    case "problem":
    case "tool":
      return step.stop;
    case "fixed":
      return step.stop + 1;
    default:
      return tier.stops.length;
  }
}

/** Tool keys player 2 holds at this step, in the order they were earned (for the card tray and boss weapons). */
export function toolsEarned(game: Game, step: Step): string[] {
  const tier = game.tiers[step.tier];

  if (!tier || step.phase === "vs") {
    return [];
  }

  return tier.stops
    .slice(0, stopsDone(step, tier))
    .map((s) => s.p2.tool ?? "")
    .filter(Boolean);
}

/** Which boss parts are already knocked off (player 2's side). */
export function partsBroken(step: Step, tier: PlayTier): number {
  if (step.phase === "bossPart") {
    return step.part + 1;
  }

  if (
    step.phase === "bossDown" ||
    step.phase === "result" ||
    step.phase === "ending"
  ) {
    return tier.boss.parts.length;
  }

  return 0;
}
