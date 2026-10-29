import { nth } from "#root/src/nth.ts";
import type { Theme } from "#root/src/audio/types.ts";
import { FULL_HEALTH } from "#root/src/content/load.ts";
import { renderTopBar, renderChips } from "#root/src/show/director/hud.ts";
import { banner, hideBanner } from "#root/src/show/director/captions.ts";
import { renderLane } from "#root/src/show/director/lanes.ts";
import {
  endingScreen,
  resultScreen,
  vsScreen,
} from "#root/src/show/director/screens.ts";
import { $ } from "#root/src/show/director/page.ts";
import { PLAYERS } from "#root/src/show/director/players.ts";
import {
  laneContext,
  type LaneContext,
  type ShowState,
} from "#root/src/show/director/show-state.ts";
import type { PresenterState } from "#root/src/show/messages.ts";
import { nextIndex, type Step } from "#root/src/content/script.ts";
import { notesFor, stepLabel } from "#root/src/show/notes.ts";
import { esc, gateHtml } from "#root/src/ui/card.ts";

/** How long a banner stays: the gate banner, and the boss banner. */
const GATE_BANNER_SECONDS = 1.45;
const BOSS_BANNER_SECONDS = 2.6;

const theme = (s: ShowState): Theme => {
  switch (s.step.phase) {
    case "vs":
    case "walk":
      return "walk";
    case "problem":
    case "tool":
    case "fixed":
      return "stop";
    case "boss":
    case "bossPart":
      return "boss";
    default:
      return s.mode === "p1" ? "defeat" : "victory";
  }
};

const scored = (s: ShowState) => {
  s.onScore?.(Math.max(s.worlds.p1.combat.score, s.worlds.p2.combat.score));
};

const renderResult = (s: ShowState) => {
  resultScreen(s);
  if (s.mode === "p1") {
    s.audio.play("lose");
  } else {
    s.audio.play("win");
  }

  scored(s);
};

export const renderNotes = (s: ShowState) => {
  const el = $("notes");

  el.hidden = !s.notesOn || !s.active;
  if (el.hidden) {
    return;
  }

  const n = notesFor(s.game, s.step, s.mode);

  el.innerHTML = `<span class="h">${esc(n.heading.toUpperCase())}</span>${n.say ? `<span class="say">${esc(n.say)}</span>` : ""}${n.presenter
    .slice(0, 2)
    .map((t) => `<span class="p">${esc(t)}</span>`)
    .join("")}`;
};

export const broadcast = (s: ShowState) => {
  if (!s.run.channel || !s.active) {
    return;
  }

  const i = nextIndex(s.script, s.at, 1, s.mode);
  const msg: PresenterState = {
    type: "state",
    index: s.at,
    total: s.script.length,
    label: stepLabel(s.game, s.step),
    mode: s.mode,
    phase: s.step.phase,
    next:
      i === s.at
        ? "Back to the map"
        : stepLabel(s.game, nth(s.script, i, "script")),
    notes: notesFor(s.game, s.step, s.mode),
    paused: s.paused,
  };

  s.run.channel.postMessage(msg);
};

const phaseDom = (s: ShowState, animate: boolean) => {
  const step = s.step;

  s.stage.view = step.phase === "vs" ? "vs" : "game";
  document.body.dataset.phase = step.phase;
  if (step.phase !== "vs") {
    $("backdrop").className = "";
  }

  $("vs").hidden = step.phase !== "vs";
  $("result").hidden = step.phase !== "result";
  $("ending").hidden = step.phase !== "ending";
  if (!animate || !["problem", "boss"].includes(step.phase)) {
    hideBanner(true);
  }
};

const paintScreens = (s: ShowState) => {
  const phase = s.step.phase;

  if (phase === "vs") {
    vsScreen(s, s.stage.vs);
  }

  if (phase === "result") {
    renderResult(s);
  }

  if (phase === "ending") {
    endingScreen(s);
    scored(s);
  }
};

const announce = (s: ShowState, lanes: LaneContext, animate: boolean) => {
  const step = s.step;
  const stop = s.tier.stops[step.stop];

  if (animate && step.phase === "problem" && stop) {
    s.audio.play("gateBanner");
    banner(
      lanes.after,
      `STOP ${step.stop + 1} OF ${s.tier.stops.length} · TIER ${s.tier.n} ${s.tier.name.toUpperCase()}`,
      gateHtml(stop.gate),
      GATE_BANNER_SECONDS,
    );
  }

  if (animate && step.phase === "boss") {
    banner(
      lanes.after,
      "PRODUCTION INCIDENT",
      `Boss fight — <em>${esc(s.tier.boss.name)}</em> is pushed to main!`,
      BOSS_BANNER_SECONDS,
    );
  }

  if (step.phase === "vs") {
    s.audio.play("vs");
  }
};

/** Paint the whole page for the step the show has just landed on. */
export const render = (s: ShowState, animate: boolean, prev?: Step) => {
  const lanes = laneContext(s);

  phaseDom(s, animate);
  renderTopBar(s.game, s.script, s.at);
  renderChips(s.mode, s.autoplay);
  paintScreens(s);
  for (const p of PLAYERS) {
    renderLane(lanes, p, animate);
  }

  announce(s, lanes, animate);
  s.audio.setTheme(theme(s));
  if (prev && prev.tier !== s.step.tier) {
    s.run.lastHealth = { p1: FULL_HEALTH, p2: FULL_HEALTH };
  }

  renderNotes(s);
  broadcast(s);
};
