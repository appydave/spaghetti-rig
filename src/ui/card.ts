import {
  TIER_HEALTH_LOSS,
  toolFor,
  type Game,
  type PlayTier,
} from "#root/src/content/load.ts";
import { gateLabel } from "#root/src/content/gatelabel.ts";
import type { Stop } from "#root/src/content/types.ts";

/** A tool card shows this many lines of the tool's configuration. */
const CONFIG_LINES_SHOWN = 6;

const ESCAPES = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
  ["'", "&#39;"],
]);

export const esc = (s: string) =>
  s.replaceAll(/[&<>"']/g, (c) => ESCAPES.get(c) ?? c);

/** A tool name without its bracketed note: "Prettier (code formatter)" → "Prettier". */
export const beforeParen = (name: string) => name.replace(/\(.*$/s, "").trim();

/** Short tool name for tight spots: "Prettier (code formatter)" → "Prettier". */
export const shortTool = (name: string) =>
  name.replace(/[(+][\s\S]*$/, "").trim();

/** A gate as a number badge plus its title: "G01 · Formatting" → [1] Formatting. */
export function gateHtml(gate: string) {
  const g = gateLabel(gate);

  return `${g.num ? `<span class="gate-badge"><small>GATE</small>${esc(g.num)}</span>` : ""}<span class="gate-title">${esc(g.title)}</span>`;
}

/** Tool art, with a generic picture for tools added later. */
export function toolImg(key: string | undefined) {
  return `<img src="/assets/tools/${esc(key || "generic")}.svg" alt="" onerror="this.onerror=null;this.src='/assets/tools/generic.svg'">`;
}

/** A CI step packed onto one line ("- name: Lint     run: npm run lint") reads as two YAML lines, so it never wraps mid-command. */
function yamlStep(code: string) {
  return code.startsWith("- name:")
    ? code.replace(/\s{3,}(run:)/, "\n  $1")
    : code;
}

/** A tool card, Magic: The Gathering style: frame, name, picture, type line, rules with the real config, power box. */
export function toolCardHtml(
  game: Game,
  tier: PlayTier,
  stop: Stop,
  k: number,
): string {
  const card = stop.p2;
  const tool = toolFor(game, card.tool);
  const cfg = tool.config;
  const lines = cfg?.lines.slice(0, CONFIG_LINES_SHOWN) ?? [];
  const hit = Math.round(TIER_HEALTH_LOSS / tier.stops.length);
  const cfgHtml =
    cfg && lines.length
      ? `<div class="cfg"><div class="file">${esc(cfg.file)}<span>${esc(cfg.status === "planned" ? "planned" : "applied in this PR")}</span></div>${lines.map(([code, means]) => `<div class="ln"><code>${esc(yamlStep(code))}</code><em>${esc(means)}</em></div>`).join("")}</div>`
      : "";

  return `<article class="tcard" data-tool="${esc(card.tool ?? "")}">
    <span class="hint">→ PLAY CARD</span>
    <div class="head"><span class="name">${esc(shortTool(tool.name))}</span><span class="cost"><i>${esc(gateLabel(stop.gate).num)}</i><i>T${tier.n}</i></span></div>
    <div class="art">${toolImg(card.tool)}</div>
    <div class="type"><span>Tool · Tier ${tier.n} ${esc(tier.name)}</span><small>${esc(card.id)} ANSWERS ${esc(stop.p1.id)}</small></div>
    <div class="rules">
      <p><b>${esc(card.title.replace(/^Tool:\s*/i, ""))}.</b> ${esc(card.text ?? tool.what ?? "")}</p>
      ${cfgHtml}
      ${card.num ? `<p class="flavor">${esc(card.num)}</p>` : ""}
    </div>
    <div class="foot"><span>STOP ${k + 1} OF ${tier.stops.length} · HEALS ${hit}% → 100%</span><span class="power">♥ 100</span></div>
  </article>`;
}
