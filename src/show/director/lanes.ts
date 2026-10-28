import * as THREE from "three";
import { gateLabel } from "#root/src/content/gatelabel.ts";
import { toolFor } from "#root/src/content/load.ts";
import type { Stop } from "#root/src/content/types.ts";
import { queryEl, queryElOrNull } from "#root/src/dom.ts";
import { caption, captionFor } from "#root/src/show/director/captions.ts";
import {
  $,
  isMachine,
  laneEl,
  WHO,
  type LaneContext,
} from "#root/src/show/director/shared.ts";
import {
  isSplit,
  toolsEarned,
  type Mode,
  type Player,
} from "#root/src/content/script.ts";
import { esc, shortTool, toolCardHtml, toolImg } from "#root/src/ui/card.ts";
import type { Game } from "#root/src/content/load.ts";
import type { Lane, Stage } from "#root/src/world/stage.ts";

/** In a split-screen mode each player's sound sits this far left (player 1) or right (player 2), on a -1..1 scale. */
export const SPLIT_PAN = 0.5;

/** How long a lane's caption stays, for the boss and for a problem card. */
const BOSS_CAPTION_SECONDS = 2.9;
const PROBLEM_CAPTION_SECONDS = 2.4;
const BOSS_PART_CAPTION_SECONDS = 1.0;
const CAPTION_SECONDS = new Map<string, number>([
  ["boss", BOSS_CAPTION_SECONDS],
  ["problem", PROBLEM_CAPTION_SECONDS],
  ["bossPart", BOSS_PART_CAPTION_SECONDS],
]);
/** A played tool card stays this long before its slot is cleared. */
const CARD_PLAY_SECONDS = 0.6;
/** A lane narrower than this many pixels gets the compact layout. */
const NARROW_LANE_PX = 1100;
/** The "caught by CI" pop appears this far from the left (a percentage, plus up to the spread) and stays this long. */
const CI_POP_LEFT = 30;
const CI_POP_LEFT_SPREAD = 40;
const CI_POP_MS = 1600;

export function buildLanes(stage: Stage, mode: Mode) {
  const lanes = $("lanes");

  lanes.innerHTML = stage
    .lanes()
    .map(
      (l) => `
      <div class="lane${l.w < NARROW_LANE_PX ? " narrow" : ""}" data-p="${l.player}" style="left:${l.x}px;width:${l.w}px">
        <div class="lane-top">
          <div class="who"><span class="label">${WHO[l.player].n}${isMachine(mode, l.player) ? " · AUTOPILOT" : mode === "spec" ? " · YOU" : ""}</span><b>${WHO[l.player].name}</b><small>${WHO[l.player].sub}</small></div>
          <div class="hp"><span class="label">HEALTH</span><div class="bar"><i></i></div><b class="pct">100%</b></div>
          <div class="score-box"><span class="label">CLEANUP SCORE</span><b class="score">000000</b></div>
          ${l.player === "p1" ? '<div class="shipped-box"><span class="label">BUGS SHIPPED</span><b class="shipped">0</b></div>' : ""}
        </div>
        <div class="bossbar" hidden><span class="name"></span><span class="count"></span><div class="bar"><i></i></div></div>
        <div class="card-slot"></div>
        <div class="caption" hidden></div>
        <div class="tray"></div>
        <div class="reticle"><i></i></div>
        <div class="reticle auto"><i></i></div>
        <div class="pops"></div>
      </div>`,
    )
    .join("");
  queryEl(document, ".divider").hidden = !isSplit(mode);
}

export const pan = (mode: Mode, p: Player) =>
  isSplit(mode) ? (p === "p1" ? -SPLIT_PAN : SPLIT_PAN) : 0;

/** Player 2's tool card flies in on the tool step. */
function flyInCard(
  ctx: LaneContext,
  slot: HTMLElement,
  stop: Stop,
  animate: boolean,
) {
  slot.innerHTML = toolCardHtml(ctx.game, ctx.tier, stop, ctx.step.stop);
  if (animate) {
    queryEl(slot, ".tcard").classList.add("fly-in");
    ctx.audio.play("cardFly", { pan: pan(ctx.mode, "p2") });
  }
}

/** Player 2 plays the card on the fixed step, and it stays a moment. */
function playCard(ctx: LaneContext, slot: HTMLElement, stop: Stop) {
  if (!slot.querySelector(".tcard")) {
    slot.innerHTML = toolCardHtml(ctx.game, ctx.tier, stop, ctx.step.stop);
  }

  const card = queryEl(slot, ".tcard");

  card.classList.remove("fly-in");
  card.classList.add("play");
  ctx.after(CARD_PLAY_SECONDS, () => {
    slot.innerHTML = "";
  });
}

/** Tool card overlay: player 2 only, never player 1. */
function cardSlot(
  ctx: LaneContext,
  p: Player,
  slot: HTMLElement,
  animate: boolean,
) {
  const { step } = ctx;
  const stop = ctx.tier.stops[step.stop];

  if (p === "p2" && step.phase === "tool" && stop) {
    flyInCard(ctx, slot, stop, animate);
  } else if (p === "p2" && step.phase === "fixed" && animate && stop) {
    playCard(ctx, slot, stop);
  } else {
    slot.innerHTML = "";
  }
}

/** The boss weaknesses already beaten at this step. */
function beatenTools({ tier, step }: LaneContext) {
  return step.phase === "bossPart"
    ? tier.boss.parts.slice(0, step.part + 1).map((x) => x.beatenBy)
    : ["bossDown", "result"].includes(step.phase)
      ? tier.boss.parts.map((x) => x.beatenBy)
      : [];
}

function emptySlot(p: Player, i: number, gate: Stop["gate"]) {
  return `<div class="slot empty"><span class="k">${i + 1}</span><b>${p === "p1" ? "NO TOOL" : `GATE ${esc(gateLabel(gate).num)}`}<small>${p === "p1" ? "VIBES ONLY" : "NOT YET"}</small></b></div>`;
}

function earnedSlot(
  game: Game,
  s: Stop,
  i: number,
  state: { fresh: boolean; used: boolean },
) {
  const key = s.p2.tool;

  return `<div class="slot earned${state.fresh ? " fresh" : ""}${state.used ? " used" : ""}"><span class="k">${i + 1}</span>${toolImg(key)}<b>${esc(shortTool(toolFor(game, key).name))}<small>GATE ${esc(gateLabel(s.gate).num)}</small></b></div>`;
}

/** Tray: player 2's earned tool cards; player 1's empty slots. */
function trayHtml(ctx: LaneContext, p: Player, animate: boolean) {
  const { game, tier, step } = ctx;
  const earned = toolsEarned(game, step);
  const beaten = beatenTools(ctx);

  return tier.stops
    .map((s, i) => {
      if (p === "p1" || i >= earned.length) {
        return emptySlot(p, i, s.gate);
      }

      return earnedSlot(game, s, i, {
        fresh: animate && step.phase === "fixed" && i === step.stop,
        used: beaten.includes(s.p2.tool ?? ""),
      });
    })
    .join("");
}

export function renderLane(ctx: LaneContext, p: Player, animate: boolean) {
  const el = laneEl(p);

  if (!el) {
    return;
  }

  const { step } = ctx;

  el.hidden = step.phase === "vs";
  cardSlot(ctx, p, queryEl(el, ".card-slot"), animate);
  caption(
    ctx,
    p,
    captionFor(ctx, p),
    animate ? (CAPTION_SECONDS.get(step.phase) ?? 0) : 0,
  );

  const tray = queryEl(el, ".tray");

  tray.hidden = step.phase === "ending" || step.phase === "result";
  tray.innerHTML = trayHtml(ctx, p, animate);
}

/** A missed enemy: a bug shipped on player 1's side, caught by CI on player 2's. */
export function slipped(p: Player) {
  const el = laneEl(p);

  if (!el) {
    return;
  }

  if (p === "p1") {
    const box = queryElOrNull(el, ".shipped-box");

    box?.classList.remove("bump");
    void box?.offsetWidth;
    box?.classList.add("bump");

    return;
  }

  const pop = document.createElement("div");

  pop.className = "ci-pop";
  pop.innerHTML = '<span class="tick">✓</span>CAUGHT BY CI';
  pop.style.left = `${CI_POP_LEFT + Math.random() * CI_POP_LEFT_SPREAD}%`;
  queryEl(el, ".pops").append(pop);
  setTimeout(() => pop.remove(), CI_POP_MS);
}

type Pointer = { x: number; y: number };

const overLane = (ptr: Pointer | null, l: Lane) =>
  !!ptr && ptr.x >= l.x && ptr.x < l.x + l.w;

/** A lane the pointer is not aiming in lets go of its crosshair, unless autoplay holds it. */
function releaseAim(ctx: LaneContext, p: Player) {
  if (!ctx.worlds[p].autoplay) {
    ctx.worlds[p].combat.pointer(null, false);
  }
}

function aimInLane(
  ctx: LaneContext,
  el: Element | null,
  l: Lane,
  shot: { ptr: Pointer; fire: boolean },
) {
  const { ptr } = shot;
  const ndc = new THREE.Vector2(
    ((ptr.x - l.x) / l.w) * 2 - 1,
    -((ptr.y - l.y) / l.h) * 2 + 1,
  );

  ctx.worlds[l.player].combat.pointer(ndc, shot.fire);

  const ret = el ? queryElOrNull(el, ".reticle") : null;

  ret?.style.setProperty("left", `${ptr.x - l.x}px`);
  ret?.style.setProperty("top", `${ptr.y - l.y}px`);
}

export function aim(ctx: LaneContext, ptr: Pointer | null, fire: boolean) {
  for (const l of ctx.stage.lanes()) {
    const el = laneEl(l.player);
    const inside =
      overLane(ptr, l) &&
      ctx.stage.view === "game" &&
      !ctx.paused &&
      !isMachine(ctx.mode, l.player);

    el?.classList.toggle("aiming", inside);
    if (!inside || !ptr) {
      releaseAim(ctx, l.player);

      continue;
    }

    aimInLane(ctx, el, l, { ptr, fire });
  }

  $("game").classList.toggle("shooting", !!ptr && ctx.stage.view === "game");
}
