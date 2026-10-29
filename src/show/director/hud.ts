import { gatesText } from "#root/src/content/gatelabel.ts";
import {
  FULL_HEALTH,
  type Game,
  type PlayTier,
} from "#root/src/content/load.ts";
import { queryEl } from "#root/src/dom.ts";
import { nth } from "#root/src/nth.ts";
import { $, SCORE_DIGITS } from "#root/src/show/director/page.ts";
import { modeInfo, type Mode, type Step } from "#root/src/content/script.ts";
import { stepLabel } from "#root/src/show/notes.ts";
import { gateHtml } from "#root/src/ui/card.ts";
import type { Lane } from "#root/src/world/stage.ts";
import type { DirectedWorld } from "#root/src/show/director/players.ts";

/** The health bar turns "low" at or below this, and "mid" below the second value. */
const LOW_HEALTH = 35;
const MID_HEALTH = 70;
/** A health change bigger than this flashes (or heals) the bar; a drift bigger than the second is tracked quietly. */
const HEALTH_FLASH_STEP = 5;
const HEALTH_TRACK_STEP = 0.5;
const PERCENT = 100;

/** What the top bar names a step by: a label above, and below it the stop's gate (markup) or a plain name. */
type StopLine =
  { label: string; html: string } | { label: string; text: string };

function walkLine(tier: PlayTier, step: Step): StopLine {
  const stop = tier.stops[step.stop];

  if (!stop) {
    return { label: "WALKING TO THE BOSS", text: tier.boss.name };
  }

  return {
    label: `WALKING TO STOP ${step.stop + 1} OF ${tier.stops.length}`,
    html: gateHtml(stop.gate),
  };
}

function stopLine(tier: PlayTier, step: Step): StopLine {
  const stop = tier.stops[step.stop];

  if (step.phase === "walk") {
    return walkLine(tier, step);
  }

  if (stop) {
    return {
      label: `STOP ${step.stop + 1} OF ${tier.stops.length}`,
      html: gateHtml(stop.gate),
    };
  }

  if (["boss", "bossPart", "bossDown"].includes(step.phase)) {
    return { label: "TIER BOSS", text: tier.boss.name };
  }

  return {
    label: step.phase === "vs" ? "GATES" : "TIER",
    text:
      step.phase === "ending"
        ? "The end of the road"
        : gatesText(tier.gates) || tier.name,
  };
}

/** The top bar: the tier, the stop, and where the show is. */
export function renderTopBar(game: Game, script: Step[], at: number) {
  const step = nth(script, at, "script");
  const tier = nth(game.tiers, step.tier, "tiers");
  const line = stopLine(tier, step);
  const stopName = $("hud-stop");

  $("hud-tier").textContent = String(tier.n).padStart(2, "0");
  $("hud-tier-name").textContent = `/ ${tier.name.toUpperCase()}`;
  $("hud-stop-label").textContent = line.label;
  if ("html" in line) {
    stopName.innerHTML = line.html;
  } else {
    stopName.textContent = line.text;
  }

  $("hud-progress").textContent =
    `${at + 1} / ${script.length} · ${stepLabel(game, step).toUpperCase()}`;
}

/** The mode and autoplay chips. */
export function renderChips(mode: Mode, autoplay: boolean) {
  $("hud-mode").textContent = modeInfo(mode).hud;
  $("hud-auto").textContent = autoplay ? "AUTOPLAY ON" : "AUTOPLAY OFF";
  queryEl(document, '[data-chip="auto"]').classList.toggle("on", autoplay);
}

/** Replay a one-shot animation class on the bar: take both off, force a reflow, put the one back. */
function restart(hp: HTMLElement, name: "flash" | "heal") {
  hp.classList.remove("flash", "heal");
  void hp.offsetWidth;
  hp.classList.add(name);
}

/** The health bar and its number, flashing on a hit and healing on a gain. Returns the health to compare against next time. */
export function updateHealth(
  el: HTMLElement,
  w: DirectedWorld,
  last: number,
): number {
  const h = Math.max(0, Math.min(FULL_HEALTH, w.health));
  const hp = queryEl(el, ".hp");

  queryEl(hp, ".bar i").style.width = `${h}%`;
  queryEl(hp, ".pct").textContent = `${Math.round(h)}%`;
  hp.classList.toggle("low", h <= LOW_HEALTH);
  hp.classList.toggle("mid", h > LOW_HEALTH && h < MID_HEALTH);
  if (h < last - HEALTH_FLASH_STEP) {
    restart(hp, "flash");

    return h;
  }

  if (h > last + HEALTH_FLASH_STEP) {
    restart(hp, "heal");

    return h;
  }

  const drifted =
    Math.abs(h - last) > HEALTH_TRACK_STEP && !hp.classList.contains("flash");

  return drifted ? h : last;
}

/** The cleanup score, and the bugs shipped where there is a box for them. */
export function updateScore(el: HTMLElement, w: DirectedWorld) {
  queryEl(el, ".score").textContent = String(w.combat.score).padStart(
    SCORE_DIGITS,
    "0",
  );

  const shipped = el.querySelector(".shipped");

  if (shipped) {
    shipped.textContent = String(w.combat.shipped);
  }
}

/** Autoplay's own reticle, where its hand is pointing. */
export function updateAutoReticle(
  el: HTMLElement,
  w: DirectedWorld,
  l: Lane | undefined,
) {
  const auto = queryEl(el, ".reticle.auto");
  const a = w.combat.autoAimScreen();

  auto.hidden = !a || !l;
  if (a && l) {
    auto.style.left = `${((a.x + 1) / 2) * l.w}px`;
    auto.style.top = `${((1 - a.y) / 2) * l.h}px`;
  }
}

/** The boss bar, shown while there is a boss on the street: its name, and how many sins are left. */
export function updateBossBar(
  el: HTMLElement,
  w: DirectedWorld,
  bossName: string | null,
) {
  const bb = queryEl(el, ".bossbar");

  bb.hidden = bossName === null || w.street.bossTotal === 0;
  if (!bb.hidden) {
    queryEl(bb, ".name").textContent = bossName;
    queryEl(bb, ".count").textContent =
      `${w.street.bossLeft} / ${w.street.bossTotal} SINS`;
    queryEl(bb, ".bar i").style.width =
      `${(w.street.bossLeft / w.street.bossTotal) * PERCENT}%`;
  }
}
