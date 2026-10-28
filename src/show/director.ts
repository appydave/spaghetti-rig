import { nth } from "#root/src/nth.ts";
import { renderChips } from "#root/src/show/director/hud.ts";
import {
  applyAutoplay,
  enterStep,
  modeChanged,
  snapCameras,
  update,
} from "#root/src/show/director/frame.ts";
import { listen } from "#root/src/show/director/input.ts";
import { buildLanes, slipped } from "#root/src/show/director/lanes.ts";
import {
  $,
  newRun,
  PLAYERS,
  type ShowState,
} from "#root/src/show/director/shared.ts";
import {
  broadcast,
  render,
  renderNotes,
} from "#root/src/show/director/view.ts";
import type { AudioEngine } from "#root/src/audio/audio.ts";
import type { Game } from "#root/src/content/load.ts";
import type { Stage } from "#root/src/world/stage.ts";
import type { PlayerWorld } from "#root/src/world/world.ts";
import {
  buildScript,
  hiddenIn,
  nextIndex,
  tierStart,
  type Mode,
  type Player,
  type Step,
} from "#root/src/show/script.ts";

export { SPLIT_PAN } from "#root/src/show/director/lanes.ts";

/** What the show is built from: the game, and the stage, worlds and audio it plays on. */
export interface DirectorParts {
  game: Game;
  stage: Stage;
  worlds: Record<Player, PlayerWorld>;
  audio: AudioEngine;
}

/** Runs the show: one step at a time, both players in lockstep, HUD and overlays to match. */
export class Director implements ShowState {
  readonly game: Game;
  readonly stage: Stage;
  readonly worlds: Record<Player, PlayerWorld>;
  readonly audio: AudioEngine;
  readonly script: Step[];
  readonly run = newRun();
  at = 0;
  mode: Mode;
  paused = false;
  autoplay = false;
  notesOn = false;
  active = false;
  onExit?: () => void;
  onScore?: (score: number) => void;

  constructor(parts: DirectorParts, mode: Mode) {
    this.game = parts.game;
    this.stage = parts.stage;
    this.worlds = parts.worlds;
    this.audio = parts.audio;
    this.script = buildScript(this.game);
    this.mode = mode;
    buildLanes(this.stage, this.mode);
    applyAutoplay(this);
    for (const p of PLAYERS) {
      this.worlds[p].combat.onSlip = () => slipped(p);
    }

    listen(this);
  }

  get step() {
    return nth(this.script, this.at, "script");
  }

  get tier() {
    return nth(this.game.tiers, this.step.tier, "tiers");
  }

  // ───────────── navigation ─────────────

  startTier(tierIndex: number) {
    const i = tierStart(this.script, tierIndex);

    if (i >= 0) {
      this.go(i, true);
    }
  }

  next() {
    if (this.step.phase === "ending") {
      this.onExit?.();

      return;
    }

    const i = nextIndex(this.script, this.at, 1, this.mode);

    if (i !== this.at) {
      this.go(i, true);
    }
  }

  back() {
    const i = nextIndex(this.script, this.at, -1, this.mode);

    if (i !== this.at) {
      this.go(i, false);
    }
  }

  jumpTier(n: number) {
    const t = this.game.tiers.find((x) => x.n === n || x.index === n - 1);

    if (t?.playable) {
      this.startTier(t.index);
    }
  }

  setMode(mode: Mode) {
    modeChanged(this, mode);
    buildLanes(this.stage, this.mode);
    if (!this.active) {
      return;
    }

    render(this, false);
    snapCameras(this);
  }

  go(i: number, animate: boolean) {
    const prev = this.step;

    this.at = i;
    enterStep(this, prev, this.step, animate);
    render(this, animate, prev);
  }

  renderChips() {
    renderChips(this.mode, this.autoplay);
  }

  toggleAutoplay() {
    this.autoplay = !this.autoplay;
    applyAutoplay(this);
    this.renderChips();
  }

  toggleNotes() {
    this.notesOn = !this.notesOn;
    renderNotes(this);
  }

  broadcast() {
    broadcast(this);
  }

  update(dt: number) {
    update(this, dt);
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.audio.paused = p;
    $("pause").hidden = !p;
    this.broadcast();
  }

  /** Is this step one that player 1 mode skips? (for tests) */
  hiddenNow() {
    return hiddenIn(this.step, this.mode);
  }
}
