import type {
  Annotation,
  Block,
  Boss,
  Card,
  Content,
  Row,
  Stop,
  Tier,
  Tool,
} from "./types";
import { isObj, str, strs } from "../loose";

/** A tier as the game plays it: its stops in file order, and whether it can be played yet. */
export interface PlayTier extends Tier {
  index: number;
  stops: Stop[];
  playable: boolean;
  hasBoss: boolean;
}
export interface Game {
  content: Content;
  tiers: PlayTier[];
}

const ROW_KINDS = ["c", "a", "d", "l"] as const;

function rows(v: unknown): Row[] {
  if (!Array.isArray(v)) {
    return [];
  }

  return v.flatMap((r): Row[] => {
    if (!Array.isArray(r) || r.length < 2) {
      return [];
    }

    const kind = ROW_KINDS.find((k) => k === r[0]) ?? "c";

    return [[kind, String(r[1] ?? "")]];
  });
}

function blocks(v: unknown): Block[] {
  if (!Array.isArray(v)) {
    return [];
  }

  return v
    .filter((o) => isObj(o))
    .map((b) => ({
      view: b.view === "diff" || b.view === "output" ? b.view : "code",
      rows: rows(b.rows),
    }));
}

function annotations(v: unknown, bs: Block[]): Annotation[] {
  if (!Array.isArray(v)) {
    return [];
  }

  return v
    .filter((o) => isObj(o))
    .flatMap((a): Annotation[] => {
      const block = Number(a.block ?? 0);
      const row = Number(a.row ?? 0);

      if (!bs[block]?.rows[row]) {
        return [];
      }

      const kind =
        a.kind === "fix" || a.kind === "note" || a.kind === "number"
          ? a.kind
          : "problem";

      return [{ block, row, match: str(a.match), kind, note: str(a.note) }];
    });
}

function card(v: unknown, fallbackTitle: string): Card {
  const c = isObj(v) ? v : {};
  const bs = blocks(c.blocks);

  return {
    id: str(c.id, "#??"),
    title: str(c.title, fallbackTitle),
    blocks: bs,
    annotations: annotations(c.annotations, bs),
    text: typeof c.text === "string" ? c.text : undefined,
    say: typeof c.say === "string" ? c.say : undefined,
    presenter: strs(c.presenter),
    num: typeof c.num === "string" ? c.num : undefined,
    tool: typeof c.tool === "string" ? c.tool : undefined,
    answers: typeof c.answers === "string" ? c.answers : undefined,
    showConfig: typeof c.showConfig === "boolean" ? c.showConfig : undefined,
    failureModes: Array.isArray(c.failureModes)
      ? c.failureModes
          .filter((o) => isObj(o))
          .map((m) => ({
            input: str(m.input),
            where: str(m.where),
            result: str(m.result),
          }))
      : undefined,
    evidence: isObj(c.evidence)
      ? {
          status: str(c.evidence.status),
          source:
            typeof c.evidence.source === "string"
              ? c.evidence.source
              : undefined,
        }
      : undefined,
    steps: Array.isArray(c.steps)
      ? c.steps
          .filter((o) => isObj(o))
          .map((s) => ({
            text: str(s.text),
            block: typeof s.block === "number" ? s.block : null,
          }))
      : undefined,
  };
}

function boss(v: unknown, tierName: string): Boss {
  const b = isObj(v) ? v : {};
  const parts = Array.isArray(b.parts)
    ? b.parts
        .filter((o) => isObj(o))
        .map((p) => ({
          part: str(p.part, "a part"),
          from: str(p.from),
          beatenBy: str(p.beatenBy),
        }))
    : [];

  return {
    id: typeof b.id === "string" ? b.id : null,
    idea: typeof b.idea === "string" ? b.idea : undefined,
    attack: typeof b.attack === "string" ? b.attack : undefined,
    p1: typeof b.p1 === "string" ? b.p1 : undefined,
    p2: typeof b.p2 === "string" ? b.p2 : undefined,
    say: typeof b.say === "string" ? b.say : undefined,
    playable: typeof b.playable === "boolean" ? b.playable : undefined,
    name: str(b.name, `${tierName} boss`),
    parts,
    presenter: strs(b.presenter),
  };
}

/** Turn the raw JSON into a game. Tolerant: missing fields get defaults, so new cards never crash the show. */
export function parseContent(raw: unknown): Game {
  const r = isObj(raw) ? raw : {};
  const screens = isObj(r.screens) ? r.screens : {};
  const title = isObj(screens.title) ? screens.title : {};
  const vs = isObj(screens.vs) ? screens.vs : {};
  const endings = isObj(r.endings) ? r.endings : {};
  const ending = (e: unknown, big: string) => ({
    big: str(isObj(e) ? e.big : undefined, big),
    sub: str(isObj(e) ? e.sub : undefined),
  });

  const tools: Record<string, Tool> = {};

  if (isObj(r.tools)) {
    for (const [key, t] of Object.entries(r.tools)) {
      if (!isObj(t)) {
        continue;
      }

      const cfg = isObj(t.config) ? t.config : undefined;

      tools[key] = {
        name: str(t.name, key),
        what: str(t.what),
        why: str(t.why),
        how: str(t.how),
        config: cfg
          ? {
              file: str(cfg.file),
              status: str(cfg.status),
              source: str(cfg.source),
              lines: Array.isArray(cfg.lines)
                ? cfg.lines
                    .filter(Array.isArray)
                    .map((l): [string, string] => [
                      String(l[0] ?? ""),
                      String(l[1] ?? ""),
                    ])
                : [],
            }
          : undefined,
      };
    }
  }

  const tierList: Tier[] = (
    Array.isArray(r.tiers) ? r.tiers.filter((o) => isObj(o)) : []
  ).map((t, i) => {
    const name = str(t.name, `Tier ${i + 1}`);

    return {
      n: typeof t.n === "number" ? t.n : i + 1,
      key: str(t.key, `tier-${i + 1}`),
      name,
      gates: str(t.gates),
      idea: str(t.idea),
      boss: boss(t.boss, name),
    };
  });

  const stops: Stop[] = (
    Array.isArray(r.stops) ? r.stops.filter((o) => isObj(o)) : []
  ).map((s) => ({
    tier: str(s.tier),
    gate: str(s.gate, "Gate"),
    p1: card(s.p1, "Bad code"),
    p2: card(s.p2, "Tool"),
  }));

  const content: Content = {
    screens: {
      title: { big: str(title.big, "Spaghetti Rig"), sub: str(title.sub) },
      vs: { p1: str(vs.p1, "No gates"), p2: str(vs.p2, "Gated") },
    },
    tiers: tierList,
    tools,
    stops,
    endings: {
      p1: ending(endings.p1, "Buried in spaghetti"),
      p2: ending(endings.p2, "Shipped"),
    },
  };

  const tiers: PlayTier[] = tierList.map((t, index) => {
    const own = stops.filter((s) => s.tier === t.key);

    return {
      ...t,
      index,
      stops: own,
      playable: own.length > 0,
      hasBoss: own.length > 0 && t.boss.parts.length > 0,
    };
  });

  return { content, tiers };
}

export async function loadContent(url = "/content/cards.json"): Promise<Game> {
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Could not load ${url} (${res.status})`);
  }

  return parseContent(await res.json());
}

/** Full health, in percent. */
export const FULL_HEALTH = 100;
/** Health a whole tier takes from player 1, so they reach the boss on 10%. */
export const TIER_HEALTH_LOSS = 90;

/** Damage one problem card does in this tier: 90% spread over its stops, so P1 reaches the boss on 10%. */
export const hitFor = (tier: PlayTier) =>
  TIER_HEALTH_LOSS / Math.max(1, tier.stops.length);

export const toolFor = (game: Game, key: string | undefined): Tool =>
  (key && game.content.tools[key]) || {
    name: key || "Tool",
    what: "",
    why: "",
    how: "",
  };
