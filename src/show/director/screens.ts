import { gatesText } from "#root/src/content/gatelabel.ts";
import type { Game, PlayTier } from "#root/src/content/load.ts";
import { nth } from "#root/src/nth.ts";
import {
  $,
  PLAYERS,
  SCORE_DIGITS,
  WHO,
} from "#root/src/show/director/shared.ts";
import {
  isSplit,
  type Mode,
  type Player,
  type Step,
} from "#root/src/content/script.ts";
import { esc } from "#root/src/ui/card.ts";
import type { Stage } from "#root/src/world/stage.ts";
import type { PlayerWorld } from "#root/src/world/world.ts";

/** What the end screens read: the show as it stands. */
export interface ScreenContext {
  game: Game;
  tier: PlayTier;
  mode: Mode;
  worlds: Record<Player, PlayerWorld>;
  script: Step[];
  at: number;
}

/** The players on show: both in a split-screen mode, otherwise the one. */
const visible = (mode: Mode): Player[] => (isSplit(mode) ? PLAYERS : [mode]);

/** The face-off screen: the tier and the boss at the end of it, with one player or two. */
export function vsScreen(ctx: ScreenContext, vsShowcase: Stage["vs"]) {
  const { game, tier: t, mode } = ctx;
  const vs = game.content.screens.vs;
  const solo = isSplit(mode) ? null : mode;

  vsShowcase.reset();
  vsShowcase.solo = solo;
  $("backdrop").className = solo ? `solo-bg ${solo}` : "vs-bg";
  $("vs").classList.toggle("solo", !!solo);
  if (solo) {
    // One player: just them, the tier and the boss waiting at the end of it.
    $("vs").innerHTML = `
        <div class="solo-card ${solo}">
          <span class="label">TIER ${t.n} OF ${game.tiers.length} · ${esc(gatesText(t.gates))}</span>
          <b class="tier-name">${esc(t.name)}</b>
          <div class="who"><span class="label">${WHO[solo].n}</span><b>${WHO[solo].name}</b><small>${esc(solo === "p1" ? vs.p1 : vs.p2)}</small></div>
          <div class="boss-name"><span class="label">AT THE END OF THE ROAD</span><b>${esc(t.boss.name)}</b></div>
        </div>`;

    return;
  }

  $("vs").innerHTML = `
      <div class="tierline"><span class="label">TIER ${t.n} OF ${game.tiers.length} · ${esc(gatesText(t.gates))}</span><b>${esc(t.name)}</b><span>${esc(t.idea ?? "")}</span></div>
      <div class="side p1"><div class="who"><span class="label">PLAYER 1</span><b>Vibe coder</b></div><span class="sub">${esc(vs.p1)}</span></div>
      <div class="mid"><span class="vsword">VS</span><span class="bossline">BOSS · ${esc(t.boss.name.toUpperCase())}</span></div>
      <div class="side p2"><div class="who"><span class="label">PLAYER 2</span><b>Specialist</b></div><span class="sub">${esc(vs.p2)}</span></div>`;
}

function vsLabel(game: Game, tierIndex: number) {
  const tier = nth(game.tiers, tierIndex, "tiers");

  return `TIER ${tier.n} · ${tier.name.toUpperCase()}`;
}

/** The tier result screen: how each player did against the boss, and what comes next. */
export function resultScreen(ctx: ScreenContext) {
  const { game, tier: t, mode, worlds } = ctx;
  const b = t.boss;
  const next = ctx.script
    .slice(ctx.at + 1)
    .find((s) => s.phase === "vs" || s.phase === "ending");
  const nextLabel =
    next?.phase === "vs" ? vsLabel(game, next.tier) : "THE ENDING";
  const col = (p: Player) =>
    p === "p1"
      ? `<div class="col p1"><span class="label">PLAYER 1 · TIER ${t.n}</span><div class="stamp">Down</div><p>${esc(b.p1 ?? "Buried.")}</p><span class="score">SCORE ${String(worlds.p1.score).padStart(SCORE_DIGITS, "0")} · ${worlds.p1.shipped} BUGS SHIPPED</span></div>`
      : `<div class="col p2"><span class="label">PLAYER 2 · TIER ${t.n}</span><div class="stamp">Cleared</div><p>${esc(b.p2 ?? "All green.")}</p><span class="score">SCORE ${String(worlds.p2.score).padStart(SCORE_DIGITS, "0")}</span></div>`;
  const el = $("result");

  el.style.setProperty("--cols", String(visible(mode).length));
  el.innerHTML = `${visible(mode)
    .map((c) => col(c))
    .join("")}<div class="next">→ NEXT: ${esc(nextLabel)}</div>`;
}

/** The ending screen: what each player's road came to. */
export function endingScreen(ctx: ScreenContext) {
  const e = ctx.game.content.endings;
  const el = $("ending");

  el.style.setProperty("--cols", String(visible(ctx.mode).length));
  el.innerHTML = `${visible(ctx.mode)
    .map(
      (p) =>
        `<div class="col ${p}"><span class="label">${p === "p1" ? "PLAYER 1 · VIBE-CODED" : "PLAYER 2 · GATED"}</span><div class="stamp">${esc(e[p].big)}</div><p>${esc(e[p].sub)}</p></div>`,
    )
    .join("")}<div class="next">→ BACK TO THE MAP</div>`;
}
