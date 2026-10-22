import { toolFor, type Game, type PlayTier } from '../content/load';
import type { Stop } from '../content/types';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Short tool name for tight spots: "Prettier (code formatter)" → "Prettier". */
export const shortTool = (name: string) => name.split('(')[0]!.split('+')[0]!.trim();

/** The gate code ("G01") from "G01 · Formatting". */
export const gateCode = (gate: string) => gate.split('·')[0]!.trim();

/** Tool art, with a generic picture for tools added later. */
export function toolImg(key: string | undefined) {
  return `<img src="/assets/tools/${esc(key || 'generic')}.svg" alt="" onerror="this.onerror=null;this.src='/assets/tools/generic.svg'">`;
}

/** A CI step packed onto one line ("- name: Lint     run: npm run lint") reads as two YAML lines, so it never wraps mid-command. */
function yamlStep(code: string) {
  return /^- name:/.test(code) ? code.replace(/\s{3,}(run:)/, '\n  $1') : code;
}

/** A tool card, Magic: The Gathering style: frame, name, picture, type line, rules with the real config, power box. */
export function toolCardHtml(game: Game, tier: PlayTier, stop: Stop, k: number): string {
  const card = stop.p2;
  const tool = toolFor(game, card.tool);
  const cfg = tool.config;
  const lines = cfg?.lines.slice(0, 6) ?? [];
  const hit = Math.round(90 / tier.stops.length);
  const cfgHtml = cfg && lines.length ? `<div class="cfg"><div class="file">${esc(cfg.file)}<span>${esc(cfg.status === 'planned' ? 'planned' : 'applied in this PR')}</span></div>${lines.map(([code, means]) => `<div class="ln"><code>${esc(yamlStep(code))}</code><em>${esc(means)}</em></div>`).join('')}</div>` : '';
  return `<article class="tcard" data-tool="${esc(card.tool ?? '')}">
    <span class="hint">→ PLAY CARD</span>
    <div class="head"><span class="name">${esc(shortTool(tool.name))}</span><span class="cost"><i>${esc(gateCode(stop.gate))}</i><i>T${tier.n}</i></span></div>
    <div class="art">${toolImg(card.tool)}</div>
    <div class="type"><span>Tool · Tier ${tier.n} ${esc(tier.name)}</span><small>${esc(card.id)} ANSWERS ${esc(stop.p1.id)}</small></div>
    <div class="rules">
      <p><b>${esc(card.title.replace(/^Tool:\s*/i, ''))}.</b> ${esc(card.text ?? tool.what ?? '')}</p>
      ${cfgHtml}
      ${card.num ? `<p class="flavor">${esc(card.num)}</p>` : ''}
    </div>
    <div class="foot"><span>STOP ${k + 1} OF ${tier.stops.length} · HEALS ${hit}% → 100%</span><span class="power">♥ 100</span></div>
  </article>`;
}
