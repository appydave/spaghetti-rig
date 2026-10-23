import * as THREE from 'three';
import type { AudioEngine, Theme } from '../audio/audio';
import { toolFor, type Game } from '../content/load';
import { gateLabel, gatesText } from '../content/gatelabel';
import { esc, gateHtml, shortTool, toolCardHtml, toolImg } from '../ui/card';
import type { Stage } from '../world/stage';
import { walkSeconds, type PlayerWorld } from '../world/world';
import { buildScript, hiddenIn, isSplit, MODES, nextIndex, notesFor, stepLabel, tierStart, toolsEarned, type Mode, type Player, type Step } from './script';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const PLAYERS: Player[] = ['p1', 'p2'];
const WHO: Record<Player, { n: string; name: string; sub: string }> = {
  p1: { n: 'PLAYER 1', name: 'Vibe coder', sub: 'no tools · ships fast' },
  p2: { n: 'PLAYER 2', name: 'Specialist', sub: 'quality gates · in CI' },
};

export interface PresenterState { type: 'state'; index: number; total: number; label: string; next: string; mode: Mode; notes: ReturnType<typeof notesFor>; phase: string; paused: boolean }

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
  private lastHealth: Record<Player, number> = { p1: 100, p2: 100 };
  private readonly channel = 'BroadcastChannel' in window ? new BroadcastChannel('spaghetti-rig') : null;
  private pointer: { x: number; y: number } | null = null;

  constructor(readonly game: Game, readonly stage: Stage, readonly worlds: Record<Player, PlayerWorld>, readonly audio: AudioEngine, mode: Mode) {
    this.script = buildScript(game);
    this.mode = mode;
    this.buildLanes();
    this.applyAutoplay();
    for (const p of PLAYERS) worlds[p].onSlip = () => this.slipped(p);
    this.channel?.addEventListener('message', (e) => {
      const m = e.data as { type: string; key?: string };
      if (m.type === 'hello') this.broadcast();
      if (m.type === 'cmd' && m.key) dispatchEvent(new CustomEvent('rig-command', { detail: m.key }));
    });
    // The HUD lets the pointer through, so a press over the street lands on the canvas, which sits
    // beside #game rather than inside it. Listen on the window and fire on the press itself: a quick
    // trackpad tap is a very short press, and waiting for `click` would add nothing.
    const move = (e: PointerEvent) => { this.pointer = { x: e.clientX, y: e.clientY }; };
    addEventListener('pointermove', move);
    addEventListener('pointerdown', (e) => {
      if (!this.active || this.paused || e.button !== 0) return;
      if ((e.target as HTMLElement).closest?.('button, a, .tcard, .overlay')) return;
      this.pointer = { x: e.clientX, y: e.clientY };
      this.aim(true);
    });
    document.documentElement.addEventListener('pointerleave', () => { this.pointer = null; });
  }

  get step() { return this.script[this.at]!; }
  get tier() { return this.game.tiers[this.step.tier]!; }
  visible(): Player[] { return isSplit(this.mode) ? PLAYERS : [this.mode as Player]; }
  /** In spec mode player 1 is driven by autoplay and the mouse plays player 2 only. */
  private machine(p: Player) { return p === 'p1' && this.mode === 'spec'; }

  // ───────────── navigation ─────────────

  startTier(tierIndex: number) {
    const i = tierStart(this.script, tierIndex);
    if (i >= 0) this.go(i, true);
  }

  next() {
    if (this.step.phase === 'ending') { this.onExit?.(); return; }
    const i = nextIndex(this.script, this.at, 1, this.mode);
    if (i !== this.at) this.go(i, true);
  }

  back() {
    const i = nextIndex(this.script, this.at, -1, this.mode);
    if (i !== this.at) this.go(i, false);
  }

  jumpTier(n: number) {
    const t = this.game.tiers.find((x) => x.n === n || x.index === n - 1);
    if (t?.playable) this.startTier(t.index);
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.applyAutoplay();
    this.stage.setMode(mode);
    this.buildLanes();
    if (!this.active) return;
    this.render(false);
    for (const p of PLAYERS) this.worlds[p].snapCamera();
  }

  go(i: number, animate: boolean) {
    const prev = this.step;
    this.at = i;
    const step = this.step;
    this.cues = [];
    this.walkT = -1; this.vsT = -1;
    const cut = !animate || prev.tier !== step.tier || prev.phase === 'vs' || ['vs', 'result', 'ending'].includes(step.phase);
    for (const p of PLAYERS) {
      const w = this.worlds[p];
      if (step.phase === 'walk' || (animate && step.phase !== 'vs')) w.enter(step); else w.settle(step);
      if (cut) w.snapCamera();
    }
    if (step.phase === 'walk') this.walkT = 0;
    if (step.phase === 'vs') this.vsT = 0;
    this.render(animate, prev);
  }

  // ───────────── per step UI ─────────────

  private render(animate: boolean, prev?: Step) {
    const step = this.step, tier = this.tier, stop = tier.stops[step.stop];
    this.stage.view = step.phase === 'vs' ? 'vs' : 'game';
    document.body.dataset.phase = step.phase;
    if (step.phase !== 'vs') $('backdrop').className = '';
    $('vs').hidden = step.phase !== 'vs';
    $('result').hidden = step.phase !== 'result';
    $('ending').hidden = step.phase !== 'ending';
    if (!animate || !['problem', 'boss'].includes(step.phase)) this.hideBanner(true);
    // Top bar.
    $('hud-tier').textContent = String(tier.n).padStart(2, '0');
    $('hud-tier-name').textContent = `/ ${tier.name.toUpperCase()}`;
    const stopLabel = $('hud-stop-label'), stopName = $('hud-stop');
    if (step.phase === 'walk') { stopLabel.textContent = stop ? `WALKING TO STOP ${step.stop + 1} OF ${tier.stops.length}` : 'WALKING TO THE BOSS'; if (stop) stopName.innerHTML = gateHtml(stop.gate); else stopName.textContent = tier.boss.name; }
    else if (stop) { stopLabel.textContent = `STOP ${step.stop + 1} OF ${tier.stops.length}`; stopName.innerHTML = gateHtml(stop.gate); }
    else if (['boss', 'bossPart', 'bossDown'].includes(step.phase)) { stopLabel.textContent = 'TIER BOSS'; stopName.textContent = tier.boss.name; }
    else { stopLabel.textContent = step.phase === 'vs' ? 'GATES' : 'TIER'; stopName.textContent = step.phase === 'ending' ? 'The end of the road' : gatesText(tier.gates) || tier.name; }
    $('hud-progress').textContent = `${this.at + 1} / ${this.script.length} · ${stepLabel(this.game, step).toUpperCase()}`;
    this.renderChips();

    if (step.phase === 'vs') this.renderVs();
    if (step.phase === 'result') this.renderResult();
    if (step.phase === 'ending') this.renderEnding();

    for (const p of PLAYERS) this.renderLane(p, animate);

    if (animate && step.phase === 'problem' && stop) {
      this.audio.play('gateBanner');
      this.banner(`STOP ${step.stop + 1} OF ${tier.stops.length} · TIER ${tier.n} ${tier.name.toUpperCase()}`, gateHtml(stop.gate), 1.45);
    }
    if (animate && step.phase === 'boss') {
      this.banner('PRODUCTION INCIDENT', `Boss fight — <em>${esc(tier.boss.name)}</em> is pushed to main!`, 2.6);
    }
    if (step.phase === 'vs') this.audio.play('vs');
    this.audio.setTheme(this.theme(step));
    if (prev && prev.tier !== step.tier) this.lastHealth = { p1: 100, p2: 100 };
    this.renderNotes();
    this.broadcast();
  }

  private theme(step: Step): Theme {
    switch (step.phase) {
      case 'vs': case 'walk': return 'walk';
      case 'problem': case 'tool': case 'fixed': return 'stop';
      case 'boss': case 'bossPart': return 'boss';
      default: return this.mode === 'p1' ? 'defeat' : 'victory';
    }
  }

  private buildLanes() {
    const lanes = $('lanes');
    lanes.innerHTML = this.stage.lanes().map((l) => `
      <div class="lane${l.w < 1100 ? ' narrow' : ''}" data-p="${l.player}" style="left:${l.x}px;width:${l.w}px">
        <div class="lane-top">
          <div class="who"><span class="label">${WHO[l.player].n}${this.machine(l.player) ? ' · AUTOPILOT' : this.mode === 'spec' ? ' · YOU' : ''}</span><b>${WHO[l.player].name}</b><small>${WHO[l.player].sub}</small></div>
          <div class="hp"><span class="label">HEALTH</span><div class="bar"><i></i></div><b class="pct">100%</b></div>
          <div class="score-box"><span class="label">CLEANUP SCORE</span><b class="score">000000</b></div>
          ${l.player === 'p1' ? '<div class="shipped-box"><span class="label">BUGS SHIPPED</span><b class="shipped">0</b></div>' : ''}
        </div>
        <div class="bossbar" hidden><span class="name"></span><span class="count"></span><div class="bar"><i></i></div></div>
        <div class="card-slot"></div>
        <div class="caption" hidden></div>
        <div class="tray"></div>
        <div class="reticle"><i></i></div>
        <div class="reticle auto"><i></i></div>
        <div class="pops"></div>
      </div>`).join('');
    document.querySelector<HTMLElement>('.divider')!.hidden = !isSplit(this.mode);
  }

  private lane(p: Player) { return document.querySelector<HTMLElement>(`.lane[data-p='${p}']`); }

  private renderLane(p: Player, animate: boolean) {
    const el = this.lane(p);
    if (!el) return;
    const step = this.step, tier = this.tier, stop = tier.stops[step.stop];
    el.hidden = step.phase === 'vs';
    // Tool card overlay: player 2 only, never player 1.
    const slot = el.querySelector<HTMLElement>('.card-slot')!;
    const showCard = p === 'p2' && step.phase === 'tool' && stop;
    const playing = p === 'p2' && step.phase === 'fixed' && animate && stop;
    if (showCard) {
      slot.innerHTML = toolCardHtml(this.game, tier, stop, step.stop);
      if (animate) { slot.firstElementChild!.classList.add('fly-in'); this.audio.play('cardFly', { pan: this.pan(p) }); }
    } else if (playing) {
      if (!slot.querySelector('.tcard')) slot.innerHTML = toolCardHtml(this.game, tier, stop, step.stop);
      slot.querySelector('.tcard')!.classList.remove('fly-in');
      slot.querySelector('.tcard')!.classList.add('play');
      this.after(0.6, () => { slot.innerHTML = ''; });
    } else slot.innerHTML = '';
    // Caption: what this side is told.
    this.caption(p, this.captionFor(p), animate ? (step.phase === 'boss' ? 2.9 : step.phase === 'problem' ? 2.4 : step.phase === 'bossPart' ? 1.0 : 0) : 0);
    // Tray: player 2's earned tool cards; player 1's empty slots.
    const earned = toolsEarned(this.game, step);
    const beaten = step.phase === 'bossPart' ? tier.boss.parts.slice(0, step.part + 1).map((x) => x.beatenBy) : ['bossDown', 'result'].includes(step.phase) ? tier.boss.parts.map((x) => x.beatenBy) : [];
    const tray = el.querySelector<HTMLElement>('.tray')!;
    tray.hidden = step.phase === 'ending' || step.phase === 'result';
    tray.innerHTML = tier.stops.map((s, i) => {
      const key = s.p2.tool;
      if (p === 'p1' || i >= earned.length) return `<div class="slot empty"><span class="k">${i + 1}</span><b>${p === 'p1' ? 'NO TOOL' : `GATE ${esc(gateLabel(s.gate).num)}`}<small>${p === 'p1' ? 'VIBES ONLY' : 'NOT YET'}</small></b></div>`;
      const fresh = animate && step.phase === 'fixed' && i === step.stop;
      const used = beaten.includes(key ?? '');
      return `<div class="slot earned${fresh ? ' fresh' : ''}${used ? ' used' : ''}"><span class="k">${i + 1}</span>${toolImg(key)}<b>${esc(shortTool(toolFor(this.game, key).name))}<small>GATE ${esc(gateLabel(s.gate).num)}</small></b></div>`;
    }).join('');
  }

  private captionFor(p: Player): { label: string; text: string } | null {
    const step = this.step, tier = this.tier, b = tier.boss, stop = tier.stops[step.stop];
    switch (step.phase) {
      case 'problem': return p === 'p1' ? { label: 'NO GATE', text: stop?.p1.say ?? '' } : { label: 'HIT · TOOL CARD READY', text: 'A gate can stop this. Play the card →' };
      case 'tool': case 'fixed': return p === 'p1' ? { label: 'PLAYER 1 · NO TOOL CARD', text: 'No gate, no fix, no heal. Ship it anyway.' } : step.phase === 'fixed' ? { label: 'FIXED IN THIS PR', text: stop?.p2.say ?? '' } : null;
      case 'boss': return { label: 'THE BOSS ATTACKS', text: b.attack ?? b.idea ?? '' };
      case 'bossPart': {
        const part = b.parts[step.part]!;
        return p === 'p1' ? { label: 'NOTHING WORKS', text: step.part === 0 ? 'Shots bounce off. One blow and player 1 is down.' : 'Player 1 is down. The boss keeps coming.' } : { label: `SIN ${step.part + 1} OF ${b.parts.length}`, text: `${part.part} ← ${shortTool(toolFor(this.game, part.beatenBy).name)}` };
      }
      case 'bossDown': return { label: p === 'p1' ? 'PLAYER 1' : 'PLAYER 2', text: (p === 'p1' ? b.p1 : b.p2) ?? '' };
      default: return null;
    }
  }

  private caption(p: Player, c: { label: string; text: string } | null, delay: number) {
    const el = this.lane(p)?.querySelector<HTMLElement>('.caption');
    if (!el) return;
    el.hidden = true;
    if (!c || !c.text) return;
    const show = () => { el.innerHTML = `<span class="label">${esc(c.label)}</span>${esc(c.text)}`; el.hidden = false; };
    if (delay > 0) this.after(delay, show); else show();
  }

  private banner(label: string, html: string, seconds: number) {
    const b = $('banner');
    $('banner-label').textContent = label;
    $('banner-text').innerHTML = html;
    b.classList.remove('out'); b.hidden = false;
    this.after(seconds, () => { b.classList.add('out'); this.after(0.35, () => { b.hidden = true; }); });
  }

  private hideBanner(now: boolean) { if (now) $('banner').hidden = true; }

  private renderVs() {
    const t = this.tier, vs = this.game.content.screens.vs;
    const solo = isSplit(this.mode) ? null : this.mode as Player;
    this.stage.vs.reset();
    this.stage.vs.solo = solo;
    $('backdrop').className = solo ? `solo-bg ${solo}` : 'vs-bg';
    $('vs').classList.toggle('solo', !!solo);
    if (solo) {
      // One player: just them, the tier and the boss waiting at the end of it.
      $('vs').innerHTML = `
        <div class="solo-card ${solo}">
          <span class="label">TIER ${t.n} OF ${this.game.tiers.length} · ${esc(gatesText(t.gates))}</span>
          <b class="tier-name">${esc(t.name)}</b>
          <div class="who"><span class="label">${WHO[solo].n}</span><b>${WHO[solo].name}</b><small>${esc(solo === 'p1' ? vs.p1 : vs.p2)}</small></div>
          <div class="boss-name"><span class="label">AT THE END OF THE ROAD</span><b>${esc(t.boss.name)}</b></div>
        </div>`;
      return;
    }
    $('vs').innerHTML = `
      <div class="tierline"><span class="label">TIER ${t.n} OF ${this.game.tiers.length} · ${esc(gatesText(t.gates))}</span><b>${esc(t.name)}</b><span>${esc(t.idea ?? '')}</span></div>
      <div class="side p1"><div class="who"><span class="label">PLAYER 1</span><b>Vibe coder</b></div><span class="sub">${esc(vs.p1)}</span></div>
      <div class="mid"><span class="vsword">VS</span><span class="bossline">BOSS · ${esc(t.boss.name.toUpperCase())}</span></div>
      <div class="side p2"><div class="who"><span class="label">PLAYER 2</span><b>Specialist</b></div><span class="sub">${esc(vs.p2)}</span></div>`;
  }

  private renderResult() {
    const t = this.tier, b = t.boss;
    const next = this.script.slice(this.at + 1).find((s) => s.phase === 'vs' || s.phase === 'ending');
    const nextLabel = next?.phase === 'vs' ? `TIER ${this.game.tiers[next.tier]!.n} · ${this.game.tiers[next.tier]!.name.toUpperCase()}` : 'THE ENDING';
    const col = (p: Player) => p === 'p1'
      ? `<div class="col p1"><span class="label">PLAYER 1 · TIER ${t.n}</span><div class="stamp">Down</div><p>${esc(b.p1 ?? 'Buried.')}</p><span class="score">SCORE ${String(this.worlds.p1.score).padStart(6, '0')} · ${this.worlds.p1.shipped} BUGS SHIPPED</span></div>`
      : `<div class="col p2"><span class="label">PLAYER 2 · TIER ${t.n}</span><div class="stamp">Cleared</div><p>${esc(b.p2 ?? 'All green.')}</p><span class="score">SCORE ${String(this.worlds.p2.score).padStart(6, '0')}</span></div>`;
    const el = $('result');
    el.style.setProperty('--cols', String(this.visible().length));
    el.innerHTML = this.visible().map(col).join('') + `<div class="next">→ NEXT: ${esc(nextLabel)}</div>`;
    if (this.mode !== 'p1') this.audio.play('win'); else this.audio.play('lose');
    this.onScore?.(Math.max(this.worlds.p1.score, this.worlds.p2.score));
  }

  private renderEnding() {
    const e = this.game.content.endings;
    const el = $('ending');
    el.style.setProperty('--cols', String(this.visible().length));
    el.innerHTML = this.visible().map((p) => `<div class="col ${p}"><span class="label">${p === 'p1' ? 'PLAYER 1 · VIBE-CODED' : 'PLAYER 2 · GATED'}</span><div class="stamp">${esc(e[p].big)}</div><p>${esc(e[p].sub)}</p></div>`).join('') + `<div class="next">→ BACK TO THE MAP</div>`;
    this.onScore?.(Math.max(this.worlds.p1.score, this.worlds.p2.score));
  }

  renderChips() {
    $('hud-mode').textContent = MODES.find((m) => m.mode === this.mode)!.hud;
    $('hud-auto').textContent = this.autoplay ? 'AUTOPLAY ON' : 'AUTOPLAY OFF';
    document.querySelector('[data-chip="auto"]')!.classList.toggle('on', this.autoplay);
  }

  toggleAutoplay() {
    this.autoplay = !this.autoplay;
    this.applyAutoplay();
    this.renderChips();
  }

  private applyAutoplay() {
    for (const p of PLAYERS) this.worlds[p].autoplay = this.autoplay || this.machine(p);
  }

  /** A missed enemy: a bug shipped on player 1's side, caught by CI on player 2's. */
  private slipped(p: Player) {
    const el = this.lane(p);
    if (!el) return;
    if (p === 'p1') {
      const box = el.querySelector<HTMLElement>('.shipped-box');
      box?.classList.remove('bump'); void box?.offsetWidth; box?.classList.add('bump');
      return;
    }
    const pop = document.createElement('div');
    pop.className = 'ci-pop';
    pop.innerHTML = '<span class="tick">✓</span>CAUGHT BY CI';
    pop.style.left = `${30 + Math.random() * 40}%`;
    el.querySelector('.pops')!.append(pop);
    setTimeout(() => pop.remove(), 1600);
  }

  toggleNotes() { this.notesOn = !this.notesOn; this.renderNotes(); }

  private renderNotes() {
    const el = $('notes');
    el.hidden = !this.notesOn || !this.active;
    if (el.hidden) return;
    const n = notesFor(this.game, this.step, this.mode);
    el.innerHTML = `<span class="h">${esc(n.heading.toUpperCase())}</span>${n.say ? `<span class="say">${esc(n.say)}</span>` : ''}${n.presenter.slice(0, 2).map((t) => `<span class="p">${esc(t)}</span>`).join('')}`;
  }

  broadcast() {
    if (!this.channel || !this.active) return;
    const i = nextIndex(this.script, this.at, 1, this.mode);
    const msg: PresenterState = {
      type: 'state', index: this.at, total: this.script.length, label: stepLabel(this.game, this.step), mode: this.mode, phase: this.step.phase,
      next: i !== this.at ? stepLabel(this.game, this.script[i]!) : 'Back to the map', notes: notesFor(this.game, this.step, this.mode), paused: this.paused,
    };
    this.channel.postMessage(msg);
  }

  // ───────────── frame ─────────────

  private after(seconds: number, fn: () => void) { this.cues.push({ at: this.clock + seconds, fn }); }

  private pan(p: Player) { return isSplit(this.mode) ? (p === 'p1' ? -0.5 : 0.5) : 0; }

  private aim(fire: boolean) {
    const ptr = this.pointer;
    for (const l of this.stage.lanes()) {
      const el = this.lane(l.player);
      const inside = !!ptr && ptr.x >= l.x && ptr.x < l.x + l.w && this.stage.view === 'game' && !this.paused && !this.machine(l.player);
      el?.classList.toggle('aiming', inside);
      if (!inside) { if (!this.worlds[l.player].autoplay) this.worlds[l.player].pointer(null, false); continue; }
      const ndc = new THREE.Vector2(((ptr!.x - l.x) / l.w) * 2 - 1, -((ptr!.y - l.y) / l.h) * 2 + 1);
      this.worlds[l.player].pointer(ndc, fire);
      const ret = el?.querySelector<HTMLElement>('.reticle');
      if (ret) { ret.style.left = `${ptr!.x - l.x}px`; ret.style.top = `${ptr!.y - l.y}px`; }
    }
    $('game').classList.toggle('shooting', !!ptr && this.stage.view === 'game');
  }

  update(dt: number) {
    if (!this.active || this.paused) return;
    this.clock += dt;
    for (const c of this.cues.filter((c) => c.at <= this.clock)) { this.cues.splice(this.cues.indexOf(c), 1); c.fn(); }
    if (this.vsT >= 0) {
      this.vsT += dt;
      if (this.vsT > 4.2) { this.vsT = -1; this.next(); return; }
    }
    if (this.walkT >= 0) {
      this.walkT += dt;
      const u = Math.min(1, this.walkT / walkSeconds());
      for (const p of PLAYERS) this.worlds[p].setWalk(u);
      if (u >= 1) { this.walkT = -1; this.next(); return; }
    }
    this.aim(false);
    for (const p of PLAYERS) this.worlds[p].update(dt);
    this.updateHud();
  }

  private updateHud() {
    for (const p of PLAYERS) {
      const el = this.lane(p);
      if (!el) continue;
      const w = this.worlds[p];
      const h = Math.max(0, Math.min(100, w.health));
      const hp = el.querySelector<HTMLElement>('.hp')!;
      hp.querySelector<HTMLElement>('.bar i')!.style.width = `${h}%`;
      hp.querySelector('.pct')!.textContent = `${Math.round(h)}%`;
      hp.classList.toggle('low', h <= 35);
      hp.classList.toggle('mid', h > 35 && h < 70);
      const last = this.lastHealth[p];
      if (h < last - 5) { hp.classList.remove('flash', 'heal'); void hp.offsetWidth; hp.classList.add('flash'); this.lastHealth[p] = h; }
      else if (h > last + 5) { hp.classList.remove('flash', 'heal'); void hp.offsetWidth; hp.classList.add('heal'); this.lastHealth[p] = h; }
      else if (Math.abs(h - last) > 0.5 && !hp.classList.contains('flash')) this.lastHealth[p] = h;
      el.querySelector('.score')!.textContent = String(w.score).padStart(6, '0');
      const shipped = el.querySelector('.shipped');
      if (shipped) shipped.textContent = String(w.shipped);
      // Autoplay's own reticle, where its hand is pointing.
      const auto = el.querySelector<HTMLElement>('.reticle.auto')!;
      const a = w.autoAimScreen();
      const l = this.stage.lanes().find((x) => x.player === p);
      auto.hidden = !a || !l;
      if (a && l) { auto.style.left = `${((a.x + 1) / 2) * l.w}px`; auto.style.top = `${((1 - a.y) / 2) * l.h}px`; }
      const bb = el.querySelector<HTMLElement>('.bossbar')!;
      const bossPhase = ['boss', 'bossPart', 'bossDown'].includes(this.step.phase);
      bb.hidden = !bossPhase || w.bossTotal === 0;
      if (!bb.hidden) {
        bb.querySelector('.name')!.textContent = this.tier.boss.name;
        bb.querySelector('.count')!.textContent = `${w.bossLeft} / ${w.bossTotal} SINS`;
        bb.querySelector<HTMLElement>('.bar i')!.style.width = `${(w.bossLeft / w.bossTotal) * 100}%`;
      }
    }
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.audio.paused = p;
    $('pause').hidden = !p;
    this.broadcast();
  }

  /** Is this step one that player 1 mode skips? (for tests) */
  hiddenNow() { return hiddenIn(this.step, this.mode); }
}
