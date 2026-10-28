import { closestEl } from "#root/src/dom.ts";
import { nth } from "#root/src/nth.ts";
import {
  parseDirectorMessage,
  type PresenterState,
} from "#root/src/show/messages.ts";
import {
  renderChips,
  renderTopBar,
  updateAutoReticle,
  updateBossBar,
  updateHealth,
  updateScore,
} from "#root/src/show/director/hud.ts";
import {
  endingScreen,
  resultScreen,
  vsScreen,
  type ScreenContext,
} from "#root/src/show/director/screens.ts";
import { banner, hideBanner } from "#root/src/show/director/captions.ts";
import {
  aim,
  buildLanes,
  renderLane,
  slipped,
} from "#root/src/show/director/lanes.ts";
import {
  $,
  isMachine,
  laneEl,
  PLAYERS,
  type LaneContext,
} from "#root/src/show/director/shared.ts";
import type { AudioEngine, Theme } from "#root/src/audio/audio.ts";
import { FULL_HEALTH, type Game } from "#root/src/content/load.ts";
import { esc, gateHtml } from "#root/src/ui/card.ts";
import type { Stage } from "#root/src/world/stage.ts";
import { walkSeconds, type PlayerWorld } from "#root/src/world/world.ts";
import {
  buildScript,
  hiddenIn,
  nextIndex,
  notesFor,
  stepLabel,
  tierStart,
  type Mode,
  type Player,
  type Step,
} from "#root/src/show/script.ts";

export { SPLIT_PAN } from "#root/src/show/director/lanes.ts";

/** How long a banner stays: the gate banner, and the boss banner. */
const GATE_BANNER_SECONDS = 1.45;
const BOSS_BANNER_SECONDS = 2.6;
/** How long the face-off screen stays before the game moves on. */
const VS_SCREEN_SECONDS = 4.2;

/** Runs the show: one step at a time, both players in lockstep, HUD and overlays to match. */
export class Director {
  readonly script: Step[];
  at = 0;
  mode: Mode;
  paused = false;
  autoplay = false;
  notesOn = false;
  active = false;
  onExit?: () => void;
  onScore?: (score: number) => void;
  private walkT = -1;
  private vsT = -1;
  private cues: { at: number; fn: () => void }[] = [];
  private clock = 0;
  private lastHealth: Record<Player, number> = {
    p1: FULL_HEALTH,
    p2: FULL_HEALTH,
  };
  private readonly channel =
    "BroadcastChannel" in window ? new BroadcastChannel("spaghetti-rig") : null;
  private pointer: { x: number; y: number } | null = null;

  constructor(
    readonly game: Game,
    readonly stage: Stage,
    readonly worlds: Record<Player, PlayerWorld>,
    readonly audio: AudioEngine,
    mode: Mode,
  ) {
    this.script = buildScript(game);
    this.mode = mode;
    buildLanes(this.stage, this.mode);
    this.applyAutoplay();
    for (const p of PLAYERS) {
      worlds[p].onSlip = () => slipped(p);
    }

    this.channel?.addEventListener("message", (e) => {
      const m = parseDirectorMessage(e.data);

      if (!m) {
        return;
      }

      if (m.type === "hello") {
        this.broadcast();
      } else {
        dispatchEvent(new CustomEvent("rig-command", { detail: m.key }));
      }
    });

    // The HUD lets the pointer through, so a press over the street lands on the canvas, which sits
    // beside #game rather than inside it. Listen on the window and fire on the press itself: a quick
    // trackpad tap is a very short press, and waiting for `click` would add nothing.
    const move = (e: PointerEvent) => {
      this.pointer = { x: e.clientX, y: e.clientY };
    };

    addEventListener("pointermove", move);
    addEventListener("pointerdown", (e) => {
      if (!this.active || this.paused || e.button !== 0) {
        return;
      }

      if (closestEl(e.target, "button, a, .tcard, .overlay")) {
        return;
      }

      this.pointer = { x: e.clientX, y: e.clientY };
      aim(this.laneContext(), this.pointer, true);
    });
    document.documentElement.addEventListener("pointerleave", () => {
      this.pointer = null;
    });
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
    this.mode = mode;
    this.applyAutoplay();
    this.stage.setMode(mode);
    buildLanes(this.stage, this.mode);
    if (!this.active) {
      return;
    }

    this.render(false);
    for (const p of PLAYERS) {
      this.worlds[p].snapCamera();
    }
  }

  go(i: number, animate: boolean) {
    const prev = this.step;

    this.at = i;

    const step = this.step;

    this.cues = [];
    this.walkT = -1;
    this.vsT = -1;

    const cut =
      !animate ||
      prev.tier !== step.tier ||
      prev.phase === "vs" ||
      ["vs", "result", "ending"].includes(step.phase);

    for (const p of PLAYERS) {
      const w = this.worlds[p];

      if (step.phase === "walk" || (animate && step.phase !== "vs")) {
        w.enter(step);
      } else {
        w.settle(step);
      }

      if (cut) {
        w.snapCamera();
      }
    }

    if (step.phase === "walk") {
      this.walkT = 0;
    }

    if (step.phase === "vs") {
      this.vsT = 0;
    }

    this.render(animate, prev);
  }

  // ───────────── per step UI ─────────────

  private render(animate: boolean, prev?: Step) {
    const step = this.step;
    const tier = this.tier;
    const stop = tier.stops[step.stop];
    const lanes = this.laneContext();

    this.stage.view = step.phase === "vs" ? "vs" : "game";
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

    // Top bar.
    renderTopBar(this.game, this.script, this.at);
    this.renderChips();

    if (step.phase === "vs") {
      vsScreen(this.screen(), this.stage.vs);
    }

    if (step.phase === "result") {
      this.renderResult();
    }

    if (step.phase === "ending") {
      endingScreen(this.screen());
      this.scored();
    }

    for (const p of PLAYERS) {
      renderLane(lanes, p, animate);
    }

    if (animate && step.phase === "problem" && stop) {
      this.audio.play("gateBanner");
      banner(
        lanes.after,
        `STOP ${step.stop + 1} OF ${tier.stops.length} · TIER ${tier.n} ${tier.name.toUpperCase()}`,
        gateHtml(stop.gate),
        GATE_BANNER_SECONDS,
      );
    }

    if (animate && step.phase === "boss") {
      banner(
        lanes.after,
        "PRODUCTION INCIDENT",
        `Boss fight — <em>${esc(tier.boss.name)}</em> is pushed to main!`,
        BOSS_BANNER_SECONDS,
      );
    }

    if (step.phase === "vs") {
      this.audio.play("vs");
    }

    this.audio.setTheme(this.theme(step));
    if (prev && prev.tier !== step.tier) {
      this.lastHealth = { p1: FULL_HEALTH, p2: FULL_HEALTH };
    }

    this.renderNotes();
    this.broadcast();
  }

  private theme(step: Step): Theme {
    switch (step.phase) {
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
        return this.mode === "p1" ? "defeat" : "victory";
    }
  }

  private laneContext(): LaneContext {
    return {
      game: this.game,
      tier: this.tier,
      step: this.step,
      mode: this.mode,
      paused: this.paused,
      audio: this.audio,
      stage: this.stage,
      worlds: this.worlds,
      after: this.after.bind(this),
    };
  }

  private screen(): ScreenContext {
    return {
      game: this.game,
      tier: this.tier,
      mode: this.mode,
      worlds: this.worlds,
      script: this.script,
      at: this.at,
    };
  }

  private renderResult() {
    resultScreen(this.screen());
    if (this.mode === "p1") {
      this.audio.play("lose");
    } else {
      this.audio.play("win");
    }

    this.scored();
  }

  private scored() {
    this.onScore?.(Math.max(this.worlds.p1.score, this.worlds.p2.score));
  }

  renderChips() {
    renderChips(this.mode, this.autoplay);
  }

  toggleAutoplay() {
    this.autoplay = !this.autoplay;
    this.applyAutoplay();
    this.renderChips();
  }

  private applyAutoplay() {
    for (const p of PLAYERS) {
      this.worlds[p].autoplay = this.autoplay || isMachine(this.mode, p);
    }
  }

  toggleNotes() {
    this.notesOn = !this.notesOn;
    this.renderNotes();
  }

  private renderNotes() {
    const el = $("notes");

    el.hidden = !this.notesOn || !this.active;
    if (el.hidden) {
      return;
    }

    const n = notesFor(this.game, this.step, this.mode);

    el.innerHTML = `<span class="h">${esc(n.heading.toUpperCase())}</span>${n.say ? `<span class="say">${esc(n.say)}</span>` : ""}${n.presenter
      .slice(0, 2)
      .map((t) => `<span class="p">${esc(t)}</span>`)
      .join("")}`;
  }

  broadcast() {
    if (!this.channel || !this.active) {
      return;
    }

    const i = nextIndex(this.script, this.at, 1, this.mode);
    const msg: PresenterState = {
      type: "state",
      index: this.at,
      total: this.script.length,
      label: stepLabel(this.game, this.step),
      mode: this.mode,
      phase: this.step.phase,
      next:
        i === this.at
          ? "Back to the map"
          : stepLabel(this.game, nth(this.script, i, "script")),
      notes: notesFor(this.game, this.step, this.mode),
      paused: this.paused,
    };

    this.channel.postMessage(msg);
  }

  // ───────────── frame ─────────────

  private after(seconds: number, fn: () => void) {
    this.cues.push({ at: this.clock + seconds, fn });
  }

  update(dt: number) {
    if (!this.active || this.paused) {
      return;
    }

    this.clock += dt;
    for (const c of this.cues.filter((c) => c.at <= this.clock)) {
      this.cues.splice(this.cues.indexOf(c), 1);
      c.fn();
    }

    if (this.vsT >= 0) {
      this.vsT += dt;
      if (this.vsT > VS_SCREEN_SECONDS) {
        this.vsT = -1;
        this.next();

        return;
      }
    }

    if (this.walkT >= 0) {
      this.walkT += dt;

      const u = Math.min(1, this.walkT / walkSeconds());

      for (const p of PLAYERS) {
        this.worlds[p].setWalk(u);
      }

      if (u >= 1) {
        this.walkT = -1;
        this.next();

        return;
      }
    }

    aim(this.laneContext(), this.pointer, false);
    for (const p of PLAYERS) {
      this.worlds[p].update(dt);
    }

    this.updateHud();
  }

  private updateHud() {
    const bossPhase = ["boss", "bossPart", "bossDown"].includes(
      this.step.phase,
    );

    for (const p of PLAYERS) {
      const el = laneEl(p);

      if (!el) {
        continue;
      }

      const w = this.worlds[p];

      this.lastHealth[p] = updateHealth(el, w, this.lastHealth[p]);
      updateScore(el, w);
      updateAutoReticle(
        el,
        w,
        this.stage.lanes().find((x) => x.player === p),
      );
      updateBossBar(el, w, bossPhase ? this.tier.boss.name : null);
    }
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
