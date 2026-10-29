// What a tier's content becomes in the world (G04 W3): the painted problem and fixed cards, the stop windows made from them, and the boss
// made from the tier's sins. Moved out of world.ts as it was; the game and the tier come in as arguments instead of the world's own fields.
import { gateText } from "#root/src/content/gatelabel.ts";
import {
  TIER_HEALTH_LOSS,
  toolFor,
  type Game,
  type PlayTier,
} from "#root/src/content/load.ts";
import type { Card, Stop } from "#root/src/content/types.ts";
import { nth } from "#root/src/nth.ts";
import { beforeParen, shortTool } from "#root/src/ui/card.ts";
import { BossModel, paintBossPanel } from "#root/src/world/models/boss.ts";
import { bossLayout } from "#root/src/world/code-window/bosslayout.ts";
import { layoutCard } from "#root/src/world/code-window/codelayout.ts";
import type { Layout } from "#root/src/world/code-window/layout/types.ts";
import { CodeWindow } from "#root/src/world/code-window/codewindow.ts";
import { paintCard } from "#root/src/world/code-window/paint/card-painter.ts";
import type { Shape } from "#root/src/world/world-shared.ts";

const TALL_CARD_COLS = 44;
const WIDE_CARD_COLS = 60;
const MIN_CARD_COLS = 34;
const TALL_WINDOW_WIDTH = 7.2;
const WIDE_WINDOW_WIDTH = 7.6;
const TALL_WINDOW_MAX_HEIGHT = 8.6;
const WIDE_WINDOW_MAX_HEIGHT = 6.2;
const BOSS_TOOL_MAX_CHARS = 18;
/** A file name made from a card title is cut to this many characters (before the extension). */
const MAX_FILE_STEM = 28;
/** The narrowest wrap width longestRow reports. */
const MIN_ROW_WIDTH = 10;

const cardCols = (shape: Shape) =>
  shape === "tall" ? TALL_CARD_COLS : WIDE_CARD_COLS;

/** Turn a card title into a plausible filename for its window header. */
function slugFile(title: string, ext = ".ts") {
  return (
    title
      .toLowerCase()
      .replace(/^tool:\s*/, "")
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "")
      .slice(0, MAX_FILE_STEM) + ext
  );
}

/** Longest row in a card, in characters (to pick a wrap width). */
function longestRow(card: Card) {
  return Math.max(
    MIN_ROW_WIDTH,
    ...card.blocks.flatMap((b) =>
      b.rows.map(([, t]) => t.length + (b.view === "diff" ? 2 : 0)),
    ),
  );
}

/** The game and the tier a card is made for. */
export interface TierOf {
  game: Game;
  tier: PlayTier;
}

/** A stop's problem card (the angry one) or its fixed card, painted wrapped to `cols` columns. */
export function paintStopCard(
  { game, tier }: TierOf,
  stop: Stop,
  role: "problem" | "fixed",
  cols: number,
): HTMLCanvasElement {
  const card = role === "problem" ? stop.p1 : stop.p2;
  const width = Math.min(cols, Math.max(MIN_CARD_COLS, longestRow(card)));
  const layout: Layout = layoutCard(card, width, slugFile(card.title));

  if (role === "problem") {
    return paintCard(layout, "angry", {
      label: `Problem card ${card.id} · ${gateText(stop.gate)}`,
      title: card.title,
      footer: card.text,
      badge: `−${Math.round(TIER_HEALTH_LOSS / tier.stops.length)}%`,
    });
  }

  const tool = toolFor(game, stop.p2.tool);

  return paintCard(layout, "fixed", {
    label: `Fixed by ${beforeParen(tool.name)} · ${card.id}`,
    title: card.title.replace(/^Tool:\s*/i, "✓ "),
    footer: card.num,
    badge: "HP 100%",
  });
}

export function makeStopWindow(
  on: TierOf,
  stop: Stop,
  kind: "problem" | "fixed",
  shape: Shape,
) {
  const cv = paintStopCard(on, stop, kind, cardCols(shape));

  return new CodeWindow(
    cv,
    shape === "tall" ? TALL_WINDOW_WIDTH : WIDE_WINDOW_WIDTH,
    kind === "problem" ? "angry" : "fixed",
    {
      maxHeight:
        shape === "tall" ? TALL_WINDOW_MAX_HEIGHT : WIDE_WINDOW_MAX_HEIGHT,
    },
  );
}

/** The boss made from a tier's content; the caller keeps its layout and adds it to the scene. */
export function makeBossModel(game: Game, tier: PlayTier): BossModel {
  const b = tier.boss;
  const L = bossLayout(b.parts.length);
  const core = paintBossPanel({
    aspect: L.core.w / L.core.h,
    header: "Production incident",
    title: b.name,
    footer: `${b.parts.length} sins · pushed to main`,
  });
  const parts = b.parts.map((p, i) => {
    const slot = nth(L.parts, i, "boss layout parts");

    return paintBossPanel({
      aspect: slot.w / slot.h,
      header: `Sin ${i + 1} of ${b.parts.length}`,
      title: p.part,
      badge: `${i + 1}`,
      footer: `✓ ${bossTool(shortTool(toolFor(game, p.beatenBy).name))}`,
    });
  });

  return new BossModel(core, parts);
}

/** A tool name short enough to read on a boss part from the back of the room (the tray shows it in full). */
function bossTool(name: string) {
  const words = name.split(/\s+/);
  const [first = "", ...rest] = words;
  let out = first;

  for (const w of rest) {
    if (`${out} ${w}`.length > BOSS_TOOL_MAX_CHARS) {
      break;
    }

    out += ` ${w}`;
  }

  return out;
}
