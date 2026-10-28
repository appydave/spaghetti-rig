import { closestEl, queryEl, queryElOrNull } from "#root/src/dom.ts";
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
import { $, PLAYERS, WHO } from "#root/src/show/director/shared.ts";
import * as THREE from "three";
import type { AudioEngine, Theme } from "#root/src/audio/audio.ts";
import { FULL_HEALTH, toolFor, type Game } from "#root/src/content/load.ts";
import { gateLabel } from "#root/src/content/gatelabel.ts";
import {
  esc,
  gateHtml,
  shortTool,
  toolCardHtml,
  toolImg,
} from "#root/src/ui/card.ts";
import type { Stage } from "#root/src/world/stage.ts";
import { walkSeconds, type PlayerWorld } from "#root/src/world/world.ts";
import {
  buildScript,
  hiddenIn,
  isSplit,
  nextIndex,
  notesFor,
  stepLabel,
  tierStart,
  toolsEarned,
  type Mode,
  type Player,
  type Step,
} from "#root/src/show/script.ts";

/** In a split-screen mode each player's sound sits this far left (player 1) or right (player 2), on a -1..1 scale. */
export const SPLIT_PAN = 0.5;

/** How long a banner stays: the gate banner, and the boss banner. */
const GATE_BANNER_SECONDS = 1.45;
const BOSS_BANNER_SECONDS = 2.6;
/** A banner takes this long to fade out before it is hidden. */
const BANNER_FADE_SECONDS = 0.35;
/** How long a lane's caption stays, for the boss and for a problem card. */
const BOSS_CAPTION_SECONDS = 2.9;
const PROBLEM_CAPTION_SECONDS = 2.4;
/** A played tool card stays this long before its slot is cleared. */
const CARD_PLAY_SECONDS = 0.6;
/** A lane narrower than this many pixels gets the compact layout. */
const NARROW_LANE_PX = 1100;
/** How long the face-off screen stays before the game moves on. */
const VS_SCREEN_SECONDS = 4.2;
/** The "caught by CI" pop appears this far from the left (a percentage, plus up to the spread) and stays this long. */
const CI_POP_LEFT = 30;
const CI_POP_LEFT_SPREAD = 40;
const CI_POP_MS = 1600;

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
    this.buildLanes();
    this.applyAutoplay();
    for (const p of PLAYERS) {
      worlds[p].onSlip = () => this.slipped(p);
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
      this.aim(true);
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

  /** In spec mode player 1 is driven by autoplay and the mouse plays player 2 only. */
  private machine(p: Player) {
    return p === "p1" && this.mode === "spec";
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
    this.buildLanes();
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

    this.stage.view = step.phase === "vs" ? "vs" : "game";
    document.body.dataset.phase = step.phase;
    if (step.phase !== "vs") {
      $("backdrop").className = "";
    }

    $("vs").hidden = step.phase !== "vs";
    $("result").hidden = step.phase !== "result";
    $("ending").hidden = step.phase !== "ending";
    if (!animate || !["problem", "boss"].includes(step.phase)) {
      this.hideBanner(true);
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
      this.renderLane(p, animate);
    }

    if (animate && step.phase === "problem" && stop) {
      this.audio.play("gateBanner");
      this.banner(
        `STOP ${step.stop + 1} OF ${tier.stops.length} · TIER ${tier.n} ${tier.name.toUpperCase()}`,
        gateHtml(stop.gate),
        GATE_BANNER_SECONDS,
      );
    }

    if (animate && step.phase === "boss") {
      this.banner(
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

  private buildLanes() {
    const lanes = $("lanes");

    lanes.innerHTML = this.stage
      .lanes()
      .map(
        (l) => `
      <div class="lane${l.w < NARROW_LANE_PX ? " narrow" : ""}" data-p="${l.player}" style="left:${l.x}px;width:${l.w}px">
        <div class="lane-top">
          <div class="who"><span class="label">${WHO[l.player].n}${this.machine(l.player) ? " · AUTOPILOT" : this.mode === "spec" ? " · YOU" : ""}</span><b>${WHO[l.player].name}</b><small>${WHO[l.player].sub}</small></div>
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
    queryEl(document, ".divider").hidden = !isSplit(this.mode);
  }

  private lane(p: Player) {
    return queryElOrNull(document, `.lane[data-p='${p}']`);
  }

  private renderLane(p: Player, animate: boolean) {
    const el = this.lane(p);

    if (!el) {
      return;
    }

    const step = this.step;
    const tier = this.tier;
    const stop = tier.stops[step.stop];

    el.hidden = step.phase === "vs";

    // Tool card overlay: player 2 only, never player 1.
    const slot = queryEl(el, ".card-slot");
    const showCard = p === "p2" && step.phase === "tool" && stop;
    const playing = p === "p2" && step.phase === "fixed" && animate && stop;

    if (showCard) {
      slot.innerHTML = toolCardHtml(this.game, tier, stop, step.stop);
      if (animate) {
        queryEl(slot, ".tcard").classList.add("fly-in");
        this.audio.play("cardFly", { pan: this.pan(p) });
      }
    } else if (playing) {
      if (!slot.querySelector(".tcard")) {
        slot.innerHTML = toolCardHtml(this.game, tier, stop, step.stop);
      }

      const card = queryEl(slot, ".tcard");

      card.classList.remove("fly-in");
      card.classList.add("play");
      this.after(CARD_PLAY_SECONDS, () => {
        slot.innerHTML = "";
      });
    } else {
      slot.innerHTML = "";
    }

    // Caption: what this side is told.
    this.caption(
      p,
      this.captionFor(p),
      animate
        ? step.phase === "boss"
          ? BOSS_CAPTION_SECONDS
          : step.phase === "problem"
            ? PROBLEM_CAPTION_SECONDS
            : step.phase === "bossPart"
              ? 1.0
              : 0
        : 0,
    );

    // Tray: player 2's earned tool cards; player 1's empty slots.
    const earned = toolsEarned(this.game, step);
    const beaten =
      step.phase === "bossPart"
        ? tier.boss.parts.slice(0, step.part + 1).map((x) => x.beatenBy)
        : ["bossDown", "result"].includes(step.phase)
          ? tier.boss.parts.map((x) => x.beatenBy)
          : [];
    const tray = queryEl(el, ".tray");

    tray.hidden = step.phase === "ending" || step.phase === "result";
    tray.innerHTML = tier.stops
      .map((s, i) => {
        const key = s.p2.tool;

        if (p === "p1" || i >= earned.length) {
          return `<div class="slot empty"><span class="k">${i + 1}</span><b>${p === "p1" ? "NO TOOL" : `GATE ${esc(gateLabel(s.gate).num)}`}<small>${p === "p1" ? "VIBES ONLY" : "NOT YET"}</small></b></div>`;
        }

        const fresh = animate && step.phase === "fixed" && i === step.stop;
        const used = beaten.includes(key ?? "");

        return `<div class="slot earned${fresh ? " fresh" : ""}${used ? " used" : ""}"><span class="k">${i + 1}</span>${toolImg(key)}<b>${esc(shortTool(toolFor(this.game, key).name))}<small>GATE ${esc(gateLabel(s.gate).num)}</small></b></div>`;
      })
      .join("");
  }

  private captionFor(p: Player): { label: string; text: string } | null {
    const step = this.step;
    const tier = this.tier;
    const b = tier.boss;
    const stop = tier.stops[step.stop];

    switch (step.phase) {
      case "problem":
        return p === "p1"
          ? { label: "NO GATE", text: stop?.p1.say ?? "" }
          : {
              label: "HIT · TOOL CARD READY",
              text: "A gate can stop this. Play the card →",
            };
      case "tool":
      case "fixed":
        return p === "p1"
          ? {
              label: "PLAYER 1 · NO TOOL CARD",
              text: "No gate, no fix, no heal. Ship it anyway.",
            }
          : step.phase === "fixed"
            ? { label: "FIXED IN THIS PR", text: stop?.p2.say ?? "" }
            : null;
      case "boss":
        return { label: "THE BOSS ATTACKS", text: b.attack ?? b.idea ?? "" };
      case "bossPart": {
        const part = nth(b.parts, step.part, "boss parts");

        return p === "p1"
          ? {
              label: "NOTHING WORKS",
              text:
                step.part === 0
                  ? "Shots bounce off. One blow and player 1 is down."
                  : "Player 1 is down. The boss keeps coming.",
            }
          : {
              label: `SIN ${step.part + 1} OF ${b.parts.length}`,
              text: `${part.part} ← ${shortTool(toolFor(this.game, part.beatenBy).name)}`,
            };
      }

      case "bossDown":
        return {
          label: p === "p1" ? "PLAYER 1" : "PLAYER 2",
          text: (p === "p1" ? b.p1 : b.p2) ?? "",
        };
      default:
        return null;
    }
  }

  private caption(
    p: Player,
    c: { label: string; text: string } | null,
    delay: number,
  ) {
    const lane = this.lane(p);
    const el = lane ? queryElOrNull(lane, ".caption") : null;

    if (!el) {
      return;
    }

    el.hidden = true;
    if (!c?.text) {
      return;
    }

    const show = () => {
      el.innerHTML = `<span class="label">${esc(c.label)}</span>${esc(c.text)}`;
      el.hidden = false;
    };

    if (delay > 0) {
      this.after(delay, show);
    } else {
      show();
    }
  }

  private banner(label: string, html: string, seconds: number) {
    const b = $("banner");

    $("banner-label").textContent = label;
    $("banner-text").innerHTML = html;
    b.classList.remove("out");
    b.hidden = false;
    this.after(seconds, () => {
      b.classList.add("out");
      this.after(BANNER_FADE_SECONDS, () => {
        b.hidden = true;
      });
    });
  }

  private hideBanner(now: boolean) {
    if (now) {
      $("banner").hidden = true;
    }
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
      this.worlds[p].autoplay = this.autoplay || this.machine(p);
    }
  }

  /** A missed enemy: a bug shipped on player 1's side, caught by CI on player 2's. */
  private slipped(p: Player) {
    const el = this.lane(p);

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

  private pan(p: Player) {
    return isSplit(this.mode) ? (p === "p1" ? -SPLIT_PAN : SPLIT_PAN) : 0;
  }

  private aim(fire: boolean) {
    const ptr = this.pointer;

    for (const l of this.stage.lanes()) {
      const el = this.lane(l.player);
      const inside =
        !!ptr &&
        ptr.x >= l.x &&
        ptr.x < l.x + l.w &&
        this.stage.view === "game" &&
        !this.paused &&
        !this.machine(l.player);

      el?.classList.toggle("aiming", inside);
      if (!inside || !ptr) {
        if (!this.worlds[l.player].autoplay) {
          this.worlds[l.player].pointer(null, false);
        }

        continue;
      }

      const ndc = new THREE.Vector2(
        ((ptr.x - l.x) / l.w) * 2 - 1,
        -((ptr.y - l.y) / l.h) * 2 + 1,
      );

      this.worlds[l.player].pointer(ndc, fire);

      const ret = el ? queryElOrNull(el, ".reticle") : null;

      if (ret) {
        ret.style.left = `${ptr.x - l.x}px`;
        ret.style.top = `${ptr.y - l.y}px`;
      }
    }

    $("game").classList.toggle("shooting", !!ptr && this.stage.view === "game");
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

    this.aim(false);
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
      const el = this.lane(p);

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
