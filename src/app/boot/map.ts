import { gatesText } from "#root/src/content/gatelabel.ts";
import type { PlayTier } from "#root/src/content/load.ts";
import { esc } from "#root/src/ui/card.ts";

/** A playable tier shows its own art; a locked one shows its boss as a shadow. Each falls back to a generic picture. */
function tierArt(t: PlayTier) {
  const dir = t.playable ? "tiers" : "bosses";

  return {
    src: `/assets/${dir}/${t.key}.svg`,
    fallback: `/assets/${dir}/generic.svg`,
  };
}

const stopsText = (t: PlayTier) =>
  `${t.stops.length} STOP${t.stops.length === 1 ? "" : "S"}`;

const lockText = (t: PlayTier) =>
  t.playable ? "" : '<span class="lock">LOCKED</span>';

const enterText = (t: PlayTier, selected: boolean) =>
  t.playable && selected
    ? '<span class="primary-button go">ENTER · PLAY ↗</span>'
    : "";

/** One tier on the map. */
function tierCard(t: PlayTier, i: number, selected: number) {
  const art = tierArt(t);

  return `<li class="tier${t.playable ? "" : " locked"}${i === selected ? " sel" : ""}" data-i="${i}">
        ${lockText(t)}
        <span class="n">${String(t.n).padStart(2, "0")}</span>
        <img class="${t.playable ? "" : "boss-shadow"}" src="${art.src}" alt="" onerror="this.onerror=null;this.src='${art.fallback}'">
        <h3>${esc(t.name)}</h3>
        <span class="meta">${esc(gatesText(t.gates))} · ${stopsText(t)}</span>
        <p>${esc(t.idea ?? "")}</p>
        <div class="boss"><span class="label">BOSS</span><b>${esc(t.boss.name)}</b></div>
        ${enterText(t, i === selected)}
      </li>`;
}

/** The map's list items, one per tier, the chosen one marked. */
export const tierCards = (tiers: readonly PlayTier[], selected: number) =>
  tiers.map((t, i) => tierCard(t, i, selected)).join("");
