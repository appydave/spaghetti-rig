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
} from "#root/src/content/types.ts";
import { isObj, optStr, str, strs, type Loose } from "#root/src/loose.ts";

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

/** The objects in a list, or none when it is not a list. */
const objs = (v: unknown): Loose[] =>
  Array.isArray(v) ? v.filter((o) => isObj(o)) : [];

function blocks(v: unknown): Block[] {
  return objs(v).map((b) => ({
    view: b.view === "diff" || b.view === "output" ? b.view : "code",
    rows: rows(b.rows),
  }));
}

function annotations(v: unknown, bs: Block[]): Annotation[] {
  return objs(v).flatMap((a): Annotation[] => {
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

/** A card's failure modes: each an input, where it goes and what happens. */
function failureModes(v: unknown): Card["failureModes"] {
  return Array.isArray(v)
    ? objs(v).map((m) => ({
        input: str(m.input),
        where: str(m.where),
        result: str(m.result),
      }))
    : undefined;
}

/** A card's evidence: its status and, when known, its source. */
function evidence(v: unknown): Card["evidence"] {
  return isObj(v)
    ? { status: str(v.status), source: optStr(v.source) }
    : undefined;
}

/** A card's walk-through steps, each pointing at a block or at none. */
function steps(v: unknown): Card["steps"] {
  return Array.isArray(v)
    ? objs(v).map((s) => ({
        text: str(s.text),
        block: typeof s.block === "number" ? s.block : null,
      }))
    : undefined;
}

function card(v: unknown, fallbackTitle: string): Card {
  const c = isObj(v) ? v : {};
  const bs = blocks(c.blocks);

  return {
    id: str(c.id, "#??"),
    title: str(c.title, fallbackTitle),
    blocks: bs,
    annotations: annotations(c.annotations, bs),
    text: optStr(c.text),
    say: optStr(c.say),
    presenter: strs(c.presenter),
    num: optStr(c.num),
    tool: optStr(c.tool),
    answers: optStr(c.answers),
    showConfig: typeof c.showConfig === "boolean" ? c.showConfig : undefined,
    failureModes: failureModes(c.failureModes),
    evidence: evidence(c.evidence),
    steps: steps(c.steps),
  };
}

function boss(v: unknown, tierName: string): Boss {
  const b = isObj(v) ? v : {};
  const parts = objs(b.parts).map((p) => ({
    part: str(p.part, "a part"),
    from: str(p.from),
    beatenBy: str(p.beatenBy),
  }));

  return {
    id: optStr(b.id) ?? null,
    idea: optStr(b.idea),
    attack: optStr(b.attack),
    p1: optStr(b.p1),
    p2: optStr(b.p2),
    say: optStr(b.say),
    playable: typeof b.playable === "boolean" ? b.playable : undefined,
    name: str(b.name, `${tierName} boss`),
    parts,
    presenter: strs(b.presenter),
  };
}

/** A tool's config file: its name, status, source and the lines shown. */
function toolConfig(v: unknown): Tool["config"] {
  return isObj(v)
    ? {
        file: str(v.file),
        status: str(v.status),
        source: str(v.source),
        lines: Array.isArray(v.lines)
          ? v.lines
              .filter(Array.isArray)
              .map((l): [string, string] => [
                String(l[0] ?? ""),
                String(l[1] ?? ""),
              ])
          : [],
      }
    : undefined;
}

/** The tools by key; an entry that is not an object is skipped. */
function tools(v: unknown) {
  const out: Record<string, Tool> = {};

  for (const [key, t] of Object.entries(isObj(v) ? v : {})) {
    if (!isObj(t)) {
      continue;
    }

    out[key] = {
      name: str(t.name, key),
      what: str(t.what),
      why: str(t.why),
      how: str(t.how),
      config: toolConfig(t.config),
    };
  }

  return out;
}

/** The tiers in file order, numbered and keyed from their place when the file leaves it out. */
function tierList(v: unknown): Tier[] {
  return objs(v).map((t, i) => {
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
}

function stopList(v: unknown): Stop[] {
  return objs(v).map((s) => ({
    tier: str(s.tier),
    gate: str(s.gate, "Gate"),
    p1: card(s.p1, "Bad code"),
    p2: card(s.p2, "Tool"),
  }));
}

const ending = (e: unknown, big: string) => ({
  big: str(isObj(e) ? e.big : undefined, big),
  sub: str(isObj(e) ? e.sub : undefined),
});

/** The title and face-off screens' words. */
function screens(v: unknown): Content["screens"] {
  const sc = isObj(v) ? v : {};
  const title = isObj(sc.title) ? sc.title : {};
  const vs = isObj(sc.vs) ? sc.vs : {};

  return {
    title: { big: str(title.big, "Spaghetti Rig"), sub: str(title.sub) },
    vs: { p1: str(vs.p1, "No gates"), p2: str(vs.p2, "Gated") },
  };
}

/** Turn the raw JSON into a game. Tolerant: missing fields get defaults, so new cards never crash the show. */
export function parseContent(raw: unknown): Game {
  const r = isObj(raw) ? raw : {};
  const endings = isObj(r.endings) ? r.endings : {};
  const tiersInFile = tierList(r.tiers);
  const stops = stopList(r.stops);
  const content: Content = {
    screens: screens(r.screens),
    tiers: tiersInFile,
    tools: tools(r.tools),
    stops,
    endings: {
      p1: ending(endings.p1, "Buried in spaghetti"),
      p2: ending(endings.p2, "Shipped"),
    },
  };
  const tiers: PlayTier[] = tiersInFile.map((t, index) => {
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
