import { hitFor, toolFor, type Game, type PlayTier } from "../content/load";
import { gatesText, gateText } from "../content/gatelabel";
import type { Card } from "../content/types";

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
export type Player = "p1" | "p2";

export function buildScript(game: Game): Step[] {
  const steps: Step[] = [];
  const s = (phase: Phase, tier: number, stop = -1, part = -1) =>
    steps.push({ phase, tier, stop, part });
  const playable = game.tiers.filter((t) => t.playable);
  for (const t of playable) {
    s("vs", t.index);
    for (const k of t.stops.keys()) {
      s("walk", t.index, k);
      s("problem", t.index, k);
      s("tool", t.index, k);
      s("fixed", t.index, k);
    }
    if (t.hasBoss) {
      s("walk", t.index, t.stops.length); // walk to the boss arena
      s("boss", t.index);
      for (const i of t.boss.parts.keys()) {
        s("bossPart", t.index, -1, i);
      }
      s("bossDown", t.index);
    }
    s("result", t.index);
  }
  if (playable.length) s("ending", playable.at(-1)!.index);
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
  while (i >= 0 && i < script.length && hiddenIn(script[i]!, mode)) i += dir;
  return i < 0 || i >= script.length ? at : i;
}

export const tierStart = (script: Step[], tierIndex: number) =>
  script.findIndex((s) => s.phase === "vs" && s.tier === tierIndex);

/** Health in percent for a player at a step (the settled value once the step's action has happened). */
export function healthAt(game: Game, step: Step, player: Player): number {
  if (step.phase === "ending") return player === "p1" ? 0 : 100;
  const tier = game.tiers[step.tier];
  if (!tier) return 100;
  const hit = hitFor(tier),
    n = tier.stops.length;
  const round = (v: number) => Math.max(0, Math.round(v * 10) / 10);
  if (player === "p1") {
    switch (step.phase) {
      case "vs":
        return 100;
      case "walk":
        return round(100 - Math.min(step.stop, n) * hit);
      case "problem":
      case "tool":
      case "fixed":
        return round(100 - (step.stop + 1) * hit);
      case "boss":
        return round(100 - n * hit);
      default:
        return 0; // the boss finishes player 1 with its first blow
    }
  }
  switch (step.phase) {
    case "problem":
    case "tool":
      return round(100 - hit);
    case "boss":
      return round(100 - hit);
    case "bossPart": {
      const parts = Math.max(1, tier.boss.parts.length);
      return round(100 - hit * (1 - (step.part + 1) / parts));
    }
    default:
      return 100;
  }
}

/** Tool keys player 2 holds at this step, in the order they were earned (for the card tray and boss weapons). */
export function toolsEarned(game: Game, step: Step): string[] {
  const tier = game.tiers[step.tier];
  if (!tier || step.phase === "vs") return [];
  const done =
    step.phase === "walk"
      ? step.stop
      : step.phase === "problem" || step.phase === "tool"
        ? step.stop
        : step.phase === "fixed"
          ? step.stop + 1
          : tier.stops.length;
  return tier.stops
    .slice(0, done)
    .map((s) => s.p2.tool ?? "")
    .filter(Boolean);
}

/** Which boss parts are already knocked off (player 2's side). */
export function partsBroken(step: Step, tier: PlayTier): number {
  if (step.phase === "bossPart") return step.part + 1;
  if (
    step.phase === "bossDown" ||
    step.phase === "result" ||
    step.phase === "ending"
  )
    return tier.boss.parts.length;
  return 0;
}

export function stepLabel(game: Game, step: Step): string {
  const tier = game.tiers[step.tier];
  const t = tier ? `Tier ${tier.n} · ${tier.name}` : "";
  const stop = tier?.stops[step.stop];
  switch (step.phase) {
    case "vs":
      return `${t} · VS`;
    case "walk":
      return stop
        ? `${t} · walking to ${gateText(stop.gate)}`
        : `${t} · walking to the boss`;
    case "problem":
      return `${gateText(stop?.gate ?? "")} · problem card`;
    case "tool":
      return `${gateText(stop?.gate ?? "")} · tool card`;
    case "fixed":
      return `${gateText(stop?.gate ?? "")} · fixed`;
    case "boss":
      return `${t} · boss: ${tier?.boss.name}`;
    case "bossPart":
      return `${t} · boss part ${step.part + 1}: ${tier?.boss.parts[step.part]?.part}`;
    case "bossDown":
      return `${t} · boss beaten`;
    case "result":
      return `${t} · result`;
    case "ending":
      return "Ending";
  }
}

export interface Notes {
  heading: string;
  say: string;
  presenter: string[];
  extra: { label: string; rows: string[][] }[];
}

/** Speaker notes for whatever card is up at this step. */
export function notesFor(game: Game, step: Step, mode: Mode): Notes {
  const tier = game.tiers[step.tier];
  const stop = tier?.stops[step.stop];
  const fromCard = (c: Card): Notes => {
    const extra: Notes["extra"] = [];
    if (c.failureModes?.length)
      extra.push({
        label: "Ways it can run",
        rows: c.failureModes.map((f) => [f.input, f.where, f.result]),
      });
    if (c.tool) {
      const tool = toolFor(game, c.tool);
      if (tool.what || tool.why)
        extra.push({
          label: `The tool · ${tool.name}`,
          rows: [
            ["What", tool.what ?? ""],
            ["Why", tool.why ?? ""],
            ["How", tool.how ?? ""],
          ].filter((r) => r[1]),
        });
      if (tool.config?.lines.length)
        extra.push({
          label: `Config · ${tool.config.file}`,
          rows: tool.config.lines.map(([a, b]) => [a, b]),
        });
    }
    if (c.evidence)
      extra.push({
        label: "Evidence",
        rows: [[c.evidence.status, c.evidence.source ?? "placeholder code"]],
      });
    return {
      heading: `${c.id} · ${c.title}`,
      say: c.say ?? "",
      presenter: c.presenter ?? [],
      extra,
    };
  };
  switch (step.phase) {
    case "problem":
      return stop ? fromCard(stop.p1) : blank(step);
    case "tool":
    case "fixed":
      if (stop && mode !== "p1") return fromCard(stop.p2);
      return stop ? fromCard(stop.p1) : blank(step);
    case "walk":
      return stop
        ? {
            heading: `Next stop · ${gateText(stop.gate)}`,
            say: stop.p1.say ?? "",
            presenter: [`Coming up: ${stop.p1.title} → ${stop.p2.title}.`],
            extra: [],
          }
        : {
            heading: `Next · boss · ${tier?.boss.name}`,
            say: tier?.boss.say ?? "",
            presenter: tier?.boss.idea ? [tier.boss.idea] : [],
            extra: [],
          };
    case "boss":
    case "bossPart":
    case "bossDown": {
      const b = tier!.boss;
      return {
        heading: `${b.id ?? ""} · Boss · ${b.name}`,
        say: b.say ?? "",
        presenter: [
          ...(b.presenter ?? []),
          ...(b.attack ? [`Attack: ${b.attack}`] : []),
          ...(b.p1 ? [`P1 sees: ${b.p1}`] : []),
          ...(b.p2 ? [`P2 sees: ${b.p2}`] : []),
        ],
        extra: [
          {
            label: "Anatomy · one part per sin",
            rows: b.parts.map((p) => [
              p.part,
              p.from,
              toolFor(game, p.beatenBy).name,
            ]),
          },
        ],
      };
    }
    case "vs":
      return {
        heading: `Tier ${tier?.n} · ${tier?.name}`,
        say: tier?.idea ?? "",
        presenter: [
          `${gatesText(tier?.gates)}. ${tier?.stops.length} stop(s), then ${tier?.boss.name}.`,
        ],
        extra: [],
      };
    case "result":
      return {
        heading: `Tier ${tier?.n} result`,
        say: tier?.boss.p2 ?? "",
        presenter: tier?.boss.p1 ? [`P1: ${tier.boss.p1}`] : [],
        extra: [],
      };
    case "ending":
      return {
        heading: "Endings",
        say: `${game.content.endings.p2.big}: ${game.content.endings.p2.sub}`,
        presenter: [
          `P1 · ${game.content.endings.p1.big}: ${game.content.endings.p1.sub}`,
        ],
        extra: [],
      };
  }
}

const blank = (step: Step): Notes => ({
  heading: step.phase,
  say: "",
  presenter: [],
  extra: [],
});
