// What the presenter reads at each step: the step's label and the speaker notes for the card that is up. Moved out of show/script.ts when
// the step model went to content/script.ts.
import { nth } from "#root/src/nth.ts";
import { toolFor, type Game, type PlayTier } from "#root/src/content/load.ts";
import { gatesText, gateText } from "#root/src/content/gatelabel.ts";
import type { Mode, Phase, Step } from "#root/src/content/script.ts";
import type { Card, Stop } from "#root/src/content/types.ts";

export interface Notes {
  heading: string;
  say: string;
  presenter: string[];
  extra: { label: string; rows: string[][] }[];
}

/** What a stop's card steps are called in the label. */
const STOP_STEP_LABEL: Partial<Record<Phase, string>> = {
  problem: "problem card",
  tool: "tool card",
  fixed: "fixed",
};

/** A tier's own steps in the label: the face-off, the boss, the boss beaten and the result. */
function tierStepLabel(
  t: string,
  step: Step,
  tier: PlayTier | undefined,
): string {
  switch (step.phase) {
    case "vs":
      return `${t} · VS`;
    case "boss":
      return `${t} · boss: ${tier?.boss.name}`;
    case "bossPart":
      return `${t} · boss part ${step.part + 1}: ${tier?.boss.parts[step.part]?.part}`;
    case "bossDown":
      return `${t} · boss beaten`;
    default:
      return `${t} · result`;
  }
}

export function stepLabel(game: Game, step: Step): string {
  const tier = game.tiers[step.tier];
  const t = tier ? `Tier ${tier.n} · ${tier.name}` : "";
  const stop = tier?.stops[step.stop];
  const stopStep = STOP_STEP_LABEL[step.phase];

  if (stopStep) {
    return `${gateText(stop?.gate ?? "")} · ${stopStep}`;
  }

  switch (step.phase) {
    case "walk":
      return stop
        ? `${t} · walking to ${gateText(stop.gate)}`
        : `${t} · walking to the boss`;
    case "ending":
      return "Ending";
    default:
      return tierStepLabel(t, step, tier);
  }
}

/** The tool's what / why / how and its config, as notes tables, for a card that plays a tool. */
function toolExtra(game: Game, key: string): Notes["extra"] {
  const extra: Notes["extra"] = [];
  const tool = toolFor(game, key);

  if (tool.what || tool.why) {
    extra.push({
      label: `The tool · ${tool.name}`,
      rows: [
        ["What", tool.what ?? ""],
        ["Why", tool.why ?? ""],
        ["How", tool.how ?? ""],
      ].filter((r) => r[1]),
    });
  }

  if (tool.config?.lines.length) {
    extra.push({
      label: `Config · ${tool.config.file}`,
      rows: tool.config.lines.map(([a, b]) => [a, b]),
    });
  }

  return extra;
}

/** A card's notes: its heading, its line to say, the presenter's lines, and its failure modes, tool and evidence as tables. */
function fromCard(game: Game, c: Card): Notes {
  const extra: Notes["extra"] = [];

  if (c.failureModes?.length) {
    extra.push({
      label: "Ways it can run",
      rows: c.failureModes.map((f) => [f.input, f.where, f.result]),
    });
  }

  if (c.tool) {
    extra.push(...toolExtra(game, c.tool));
  }

  if (c.evidence) {
    extra.push({
      label: "Evidence",
      rows: [[c.evidence.status, c.evidence.source ?? "placeholder code"]],
    });
  }

  return {
    heading: `${c.id} · ${c.title}`,
    say: c.say ?? "",
    presenter: c.presenter ?? [],
    extra,
  };
}

/** On the walk: what the next stop is, or the boss when the stops are done. */
function walkNotes(stop: Stop | undefined, tier: PlayTier | undefined): Notes {
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
}

/** The boss's notes: its line, its attack and what each player sees, and one row per part with the tool that beats it. */
function bossNotes(game: Game, step: Step): Notes {
  const b = nth(game.tiers, step.tier, "tiers").boss;

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

/** The tier's face-off and result screens. */
function tierNotes(tier: PlayTier | undefined, phase: "vs" | "result"): Notes {
  return phase === "vs"
    ? {
        heading: `Tier ${tier?.n} · ${tier?.name}`,
        say: tier?.idea ?? "",
        presenter: [
          `${gatesText(tier?.gates)}. ${tier?.stops.length} stop(s), then ${tier?.boss.name}.`,
        ],
        extra: [],
      }
    : {
        heading: `Tier ${tier?.n} result`,
        say: tier?.boss.p2 ?? "",
        presenter: tier?.boss.p1 ? [`P1: ${tier.boss.p1}`] : [],
        extra: [],
      };
}

function endingNotes(game: Game): Notes {
  return {
    heading: "Endings",
    say: `${game.content.endings.p2.big}: ${game.content.endings.p2.sub}`,
    presenter: [
      `P1 · ${game.content.endings.p1.big}: ${game.content.endings.p1.sub}`,
    ],
    extra: [],
  };
}

/** A stop's card steps: player 1's problem card, then player 2's tool card (player 1's card again in player-1 mode). */
function stopNotes(game: Game, step: Step, mode: Mode): Notes {
  const stop = game.tiers[step.tier]?.stops[step.stop];

  if (!stop) {
    return blank(step);
  }

  return step.phase === "problem" || mode === "p1"
    ? fromCard(game, stop.p1)
    : fromCard(game, stop.p2);
}

/** Speaker notes for whatever card is up at this step. */
export function notesFor(game: Game, step: Step, mode: Mode): Notes {
  const tier = game.tiers[step.tier];

  switch (step.phase) {
    case "problem":
    case "tool":
    case "fixed":
      return stopNotes(game, step, mode);
    case "walk":
      return walkNotes(tier?.stops[step.stop], tier);
    case "boss":
    case "bossPart":
    case "bossDown":
      return bossNotes(game, step);
    case "vs":
    case "result":
      return tierNotes(tier, step.phase);
    case "ending":
      return endingNotes(game);
  }
}

const blank = (step: Step): Notes => ({
  heading: step.phase,
  say: "",
  presenter: [],
  extra: [],
});
