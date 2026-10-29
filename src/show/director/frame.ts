import {
  updateAutoReticle,
  updateBossBar,
  updateHealth,
  updateScore,
} from "#root/src/show/director/hud.ts";
import { aim } from "#root/src/show/director/lanes.ts";
import { laneEl } from "#root/src/show/director/page.ts";
import { PLAYERS, isMachine } from "#root/src/show/director/players.ts";
import {
  laneContext,
  type ShowState,
} from "#root/src/show/director/show-state.ts";
import type { Mode, Step } from "#root/src/content/script.ts";
import { walkSeconds } from "#root/src/world/world.ts";

/** How long the face-off screen stays before the game moves on. */
const VS_SCREEN_SECONDS = 4.2;

export const applyAutoplay = (s: ShowState) => {
  for (const p of PLAYERS) {
    s.worlds[p].autoplay = s.autoplay || isMachine(s.mode, p);
  }
};

/** A cut jumps the camera; walking on within a tier glides. */
const isCut = (prev: Step, step: Step, animate: boolean) =>
  !animate ||
  prev.tier !== step.tier ||
  prev.phase === "vs" ||
  ["vs", "result", "ending"].includes(step.phase);

const enterWorlds = (
  s: ShowState,
  step: Step,
  animate: boolean,
  cut: boolean,
) => {
  for (const p of PLAYERS) {
    const w = s.worlds[p];

    if (step.phase === "walk" || (animate && step.phase !== "vs")) {
      w.enter(step);
    } else {
      w.settle(step);
    }

    if (cut) {
      w.snapCamera();
    }
  }
};

/** Put both worlds on the new step and start the walk and face-off timers. */
export const enterStep = (
  s: ShowState,
  prev: Step,
  step: Step,
  animate: boolean,
) => {
  s.run.cues = [];
  s.run.walkT = -1;
  s.run.vsT = -1;
  enterWorlds(s, step, animate, isCut(prev, step, animate));
  if (step.phase === "walk") {
    s.run.walkT = 0;
  }

  if (step.phase === "vs") {
    s.run.vsT = 0;
  }
};

export const snapCameras = (s: ShowState) => {
  for (const p of PLAYERS) {
    s.worlds[p].snapCamera();
  }
};

export const modeChanged = (s: ShowState, mode: Mode) => {
  s.mode = mode;
  applyAutoplay(s);
  s.stage.setMode(mode);
};

const runCues = (s: ShowState, dt: number) => {
  const run = s.run;

  run.clock += dt;
  for (const c of run.cues.filter((c) => c.at <= run.clock)) {
    run.cues.splice(run.cues.indexOf(c), 1);
    c.fn();
  }
};

/** Run the face-off timer; true once it has moved the show on. */
const tickVs = (s: ShowState, dt: number) => {
  const run = s.run;

  if (run.vsT < 0) {
    return false;
  }

  run.vsT += dt;
  if (run.vsT <= VS_SCREEN_SECONDS) {
    return false;
  }

  run.vsT = -1;
  s.next();

  return true;
};

/** Run the walk timer; true once it has moved the show on. */
const tickWalk = (s: ShowState, dt: number) => {
  const run = s.run;

  if (run.walkT < 0) {
    return false;
  }

  run.walkT += dt;

  const u = Math.min(1, run.walkT / walkSeconds());

  for (const p of PLAYERS) {
    s.worlds[p].setWalk(u);
  }

  if (u < 1) {
    return false;
  }

  run.walkT = -1;
  s.next();

  return true;
};

const updateHud = (s: ShowState) => {
  const bossPhase = ["boss", "bossPart", "bossDown"].includes(s.step.phase);

  for (const p of PLAYERS) {
    const el = laneEl(p);

    if (!el) {
      continue;
    }

    const w = s.worlds[p];

    s.run.lastHealth[p] = updateHealth(el, w, s.run.lastHealth[p]);
    updateScore(el, w);
    updateAutoReticle(
      el,
      w,
      s.stage.lanes().find((x) => x.player === p),
    );
    updateBossBar(el, w, bossPhase ? s.tier.boss.name : null);
  }
};

/** One frame of the show. */
export const update = (s: ShowState, dt: number) => {
  if (!s.active || s.paused) {
    return;
  }

  runCues(s, dt);
  if (tickVs(s, dt) || tickWalk(s, dt)) {
    return;
  }

  aim(laneContext(s), s.run.pointer, false);
  for (const p of PLAYERS) {
    s.worlds[p].update(dt);
  }

  updateHud(s);
};
