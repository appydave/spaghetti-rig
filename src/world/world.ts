import * as THREE from 'three';
import type { AudioEngine, Sfx } from '../audio/audio';
import { gateText } from '../content/gatelabel';
import { toolFor, type Game, type PlayTier } from '../content/load';
import type { Card, Stop } from '../content/types';
import { healthAt, partsBroken, type Player, type Step } from '../show/script';
import { AutoGunner } from './autogunner';
import { BossModel, paintBossPanel } from './boss';
import { bossLayout, type BossLayout } from './bosslayout';
import { Character, type Pose } from './characters';
import { buildCity, SEGMENT } from './city';
import { layoutCard, longestRow, slugFile, type Layout } from './codelayout';
import { CodeWindow, paintCard, type Mood } from './codewindow';
import { Effects } from './effects';
import { Enemy, SCORE, type EnemyKind } from './enemies';
import { Gate, type GateState } from './gate';
import { Debris } from './physics';
import { shortTool } from '../ui/card';
import { clamp01, disposeTree, ease, kit, lerp, rng, toon } from './toon';

export type CameraMode = 'follow' | 'stop' | 'boss' | 'portrait';
type Shape = 'wide' | 'tall';

const stopZ = (k: number) => -(k + 1) * SEGMENT;
const standZ = (k: number) => stopZ(k) + 4;
const WALK_SECONDS = 9;
/** Boss arena: how far down the road the boss stands and how high its main window floats. */
const BOSS = { y: 6.2 };
export const walkSeconds = () => WALK_SECONDS;

interface Tween { age: number; dur: number; fn: (k: number) => void; done?: () => void }
interface Cue { at: number; fn: () => void }

/** What a player's world looks like once a step has fully happened. */
interface State {
  tier: number;
  z: number;
  camera: CameraMode;
  window: 'none' | 'problem' | 'fixed';
  stop: number;
  debt: number;
  gates: GateState[];
  boss: 'none' | 'alive' | 'dead';
  broken: number;
  pose: Pose;
  pile: boolean;
  health: number;
}

/**
 * One player's world: street, gates, character, enemies, the stop's code window and the boss.
 * Both players get one each, built from the same seed, so they walk the same road side by side.
 */
export class PlayerWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
  readonly character: Character;
  readonly fx: Effects;
  readonly debris: Debris;
  score = 0;
  /** Trigger pulls, from the mouse or autoplay. */
  shots = 0;
  /** Enemies that got past player 1: bugs shipped to production. */
  shipped = 0;
  /** An enemy got past: shipped (player 1) or caught by CI (player 2). */
  onSlip?: (kind: EnemyKind) => void;
  /** Health shown in the HUD (animated). */
  health = 100;
  bossTotal = 0;
  bossLeft = 0;
  autoplay = false;
  aspect = 16 / 9;
  shape: Shape = 'wide';

  private tier: PlayTier | null = null;
  private city: THREE.Group | null = null;
  private gates: Gate[] = [];
  private window: { win: CodeWindow; key: string; reading: boolean } | null = null;
  private debt: { win: CodeWindow; key: string }[] = [];
  private boss: BossModel | null = null;
  /** Kept after the boss breaks, so the camera holds its shot. */
  private bossLayout: BossLayout | null = null;
  private pile: THREE.Group | null = null;
  private enemies: Enemy[] = [];
  private temps: { dispose(): void }[] = [];
  private tweens: Tween[] = [];
  private cues: Cue[] = [];
  private clock = 0;
  private state: State | null = null;
  private walk: { from: number; to: number; u: number; spawns: { at: number; kind: EnemyKind; seed: number }[]; next: number } | null = null;
  private shake = 0;
  private camPos = new THREE.Vector3(3, 3, 8);
  private camLook = new THREE.Vector3(0, 1.5, -6);
  private camMode: CameraMode = 'follow';
  private readonly gunner: AutoGunner;
  private aim: THREE.Vector3 | null = null;
  private autoTarget = -1;
  private readonly sun: THREE.DirectionalLight;
  private stepRef: Step | null = null;

  constructor(readonly player: Player, private readonly game: Game, private readonly audio: AudioEngine, private readonly pan: () => number) {
    this.scene.background = new THREE.Color('#b8d3c2');
    this.scene.fog = new THREE.Fog('#c2d9c8', 40, 120);
    this.scene.add(new THREE.HemisphereLight('#e4f7ff', '#586d55', 2.2));
    this.sun = new THREE.DirectionalLight('#fff0c1', 2.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04; this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    const rim = new THREE.DirectionalLight('#93cfff', 1.1);
    rim.position.set(-30, 20, -40); this.scene.add(rim);
    this.gunner = new AutoGunner(player === 'p1' ? 11 : 29);
    this.character = new Character(player);
    this.scene.add(this.character.root);
    this.fx = new Effects(this.scene);
    this.debris = new Debris(this.scene);
    this.debris.onBounce = (s) => this.sfx('debrisBounce', 0.3 + s * 0.5);
  }

  private sfx(name: Sfx, volume = 1) { this.audio.play(name, { pan: this.pan(), volume }); }

  // ───────────────────────────── state ─────────────────────────────

  private stateFor(step: Step): State {
    const tier = this.game.tiers[step.tier]!;
    const n = tier.stops.length;
    const p1 = this.player === 'p1';
    const hp = healthAt(this.game, step, this.player);
    const s: State = {
      tier: step.tier, z: 0, camera: 'follow', window: 'none', stop: -1, debt: 0, gates: tier.stops.map(() => 'idle'),
      boss: 'none', broken: 0, pose: 'idle', pile: false, health: hp,
    };
    const passed = (k: number) => { for (let i = 0; i < k; i++) s.gates[i] = p1 ? 'broken' : 'open'; };
    switch (step.phase) {
      case 'vs': s.z = 0; s.camera = 'portrait'; break;
      case 'walk':
        s.z = step.stop === 0 ? 0 : standZ(step.stop - 1);
        s.pose = 'walk'; passed(step.stop); s.debt = p1 ? step.stop : 0;
        break;
      case 'problem': case 'tool': case 'fixed': {
        s.z = standZ(step.stop); s.camera = 'stop'; s.stop = step.stop; passed(step.stop); s.debt = p1 ? step.stop : 0;
        const fixed = step.phase === 'fixed' && !p1;
        s.window = fixed ? 'fixed' : 'problem';
        s.gates[step.stop] = fixed ? 'open' : 'alarm';
        s.pose = p1 ? 'hurt' : fixed ? 'idle' : 'aim';
        break;
      }
      default: {
        // Boss arena and after.
        s.z = standZ(n); s.camera = 'boss'; passed(n); s.debt = p1 ? n : 0;
        s.boss = 'alive';
        s.broken = p1 ? 0 : partsBroken(step, tier);
        if (step.phase === 'bossDown' || step.phase === 'result' || step.phase === 'ending') s.boss = p1 ? 'alive' : 'dead';
        s.pose = p1 ? (step.phase === 'boss' ? 'hurt' : 'down') : step.phase === 'boss' || step.phase === 'bossPart' ? 'aim' : 'victory';
        s.pile = p1 && step.phase !== 'boss' && step.phase !== 'bossPart';
        if (step.phase === 'result' || step.phase === 'ending') s.camera = 'portrait';
        if (p1 && (step.phase === 'result' || step.phase === 'ending')) s.boss = 'none';
        if (!p1 && (step.phase === 'result' || step.phase === 'ending')) s.boss = 'dead';
      }
    }
    return s;
  }

  /** Make the world match a state, reusing whatever already matches. */
  private reconcile(s: State) {
    this.clearAnimations();
    const tier = this.game.tiers[s.tier]!;
    if (this.tier !== tier) this.buildTier(tier);
    this.character.root.position.set(0, 0, s.z);
    this.character.root.rotation.y = 0;
    this.character.pose = s.pose;
    s.gates.forEach((g, i) => { if (this.gates[i]) this.gates[i]!.state = g; });
    // Stop window.
    const wantKey = s.window === 'none' ? '' : `${s.stop}:${s.window}:${this.shape}`;
    if ((this.window?.key ?? '') !== wantKey) {
      this.window?.win.dispose(); this.window = null;
      if (wantKey) {
        const stop = tier.stops[s.stop]!;
        const win = this.makeStopWindow(stop, s.window === 'fixed' ? 'fixed' : 'problem');
        this.scene.add(win.group);
        this.window = { win, key: wantKey, reading: true };
      }
    }
    if (this.window) { this.window.reading = true; this.window.win.rattle = s.window === 'problem' ? (this.player === 'p1' ? 0.5 : 0.3) : 0; }
    // Tech debt trailing player 1.
    while (this.debt.length > s.debt) this.debt.pop()!.win.dispose();
    for (let k = this.debt.length; k < s.debt; k++) {
      const stop = tier.stops[k]!;
      const win = new CodeWindow(this.paint(stop.p1, 'angry', 'problem', 30, stop), 1.1, 'angry');
      this.scene.add(win.group);
      this.debt.push({ win, key: String(k) });
    }
    // Boss.
    if (s.boss === 'none' || s.boss === 'dead') { this.boss?.dispose(); this.boss = null; }
    else {
      if (!this.boss || this.boss.remaining < tier.boss.parts.length - s.broken) { this.boss?.dispose(); this.boss = this.makeBoss(tier); }
      for (let i = 0; i < s.broken; i++) this.boss.dropPart(i);
      this.boss.group.position.set(0, BOSS.y, s.z - this.bossBack());
    }
    this.bossTotal = tier.hasBoss ? tier.boss.parts.length : 0;
    this.bossLeft = s.boss === 'dead' ? 0 : this.bossTotal - s.broken;
    // Spaghetti burying player 1.
    if (s.pile && !this.pile) { this.pile = this.makePile(); this.scene.add(this.pile); }
    if (!s.pile && this.pile) { disposeTree(this.pile); this.pile = null; }
    if (this.pile) this.pile.position.set(0, 0, s.z);
    this.health = s.health;
    this.camMode = s.camera;
    this.state = s;
  }

  private clearAnimations() {
    this.tweens = []; this.cues = [];
    for (const t of this.temps) t.dispose();
    this.temps = [];
    this.walk = null;
  }

  private buildTier(tier: PlayTier) {
    if (this.city) disposeTree(this.city);
    for (const g of this.gates) g.dispose();
    this.window?.win.dispose(); this.window = null;
    for (const d of this.debt) d.win.dispose();
    this.debt = [];
    this.boss?.dispose(); this.boss = null; this.bossLayout = null;
    for (const e of this.enemies) disposeTree(e.group);
    this.enemies = [];
    this.debris.clear(); this.fx.clear();
    const length = (tier.stops.length + 1) * SEGMENT + 40;
    // The boss stands in an open plaza beyond the last stop, so no building can hide any part of it.
    const arena = standZ(tier.stops.length);
    this.city = buildCity(length, 1000 + tier.index * 77, tier.hasBoss ? { from: arena + 16, to: arena - 60 } : undefined);
    this.scene.add(this.city);
    this.gates = tier.stops.map((s, k) => { const g = new Gate(s.gate, stopZ(k)); this.scene.add(g.group); return g; });
    this.tier = tier;
  }

  // ───────────────────────────── content → objects ─────────────────────────────

  private cols() { return this.shape === 'tall' ? 44 : 60; }

  private paint(card: Card, mood: Mood, role: 'problem' | 'fixed', cols: number, stop: Stop): HTMLCanvasElement {
    const width = Math.min(cols, Math.max(34, longestRow(card)));
    const layout: Layout = layoutCard(card, width, slugFile(card.title));
    const tier = this.tier!;
    if (role === 'problem') {
      return paintCard(layout, mood, { label: `Problem card ${card.id} · ${gateText(stop.gate)}`, title: card.title, footer: card.text, badge: `−${Math.round(90 / tier.stops.length)}%` });
    }
    const tool = toolFor(this.game, stop.p2.tool);
    return paintCard(layout, 'fixed', { label: `Fixed by ${tool.name.split('(')[0]!.trim()} · ${card.id}`, title: card.title.replace(/^Tool:\s*/i, '✓ '), footer: card.num, badge: 'HP 100%' });
  }

  private makeStopWindow(stop: Stop, kind: 'problem' | 'fixed') {
    const card = kind === 'problem' ? stop.p1 : stop.p2;
    const cv = this.paint(card, kind === 'problem' ? 'angry' : 'fixed', kind, this.cols(), stop);
    return new CodeWindow(cv, this.shape === 'tall' ? 7.2 : 7.6, kind === 'problem' ? 'angry' : 'fixed', { maxHeight: this.shape === 'tall' ? 8.6 : 6.2 });
  }

  private makeBoss(tier: PlayTier): BossModel {
    const b = tier.boss;
    const L = bossLayout(b.parts.length);
    const core = paintBossPanel({ aspect: L.core.w / L.core.h, header: 'Production incident', title: b.name, footer: `${b.parts.length} sins · pushed to main` });
    const parts = b.parts.map((p, i) => paintBossPanel({
      aspect: L.parts[i]!.w / L.parts[i]!.h, header: `Sin ${i + 1} of ${b.parts.length}`, title: p.part, badge: `${i + 1}`,
      footer: `✓ ${bossTool(shortTool(toolFor(this.game, p.beatenBy).name))}`,
    }));
    const boss = new BossModel(core, parts);
    this.bossLayout = boss.layout;
    this.scene.add(boss.group);
    return boss;
  }

  private makePile() {
    const pile = new THREE.Group(); pile.name = 'spaghetti-pile';
    const r = rng(42);
    for (let i = 0; i < 26; i++) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k < 6; k++) pts.push(new THREE.Vector3((r() - 0.5) * 2.4, r() * 1.0 * (1 - Math.abs(k - 3) / 4), -1.2 + (r() - 0.2) * 2.4));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.09, 6), toon(i % 3 ? '#f3d27a' : '#efc25e'));
      tube.castShadow = true; pile.add(tube);
    }
    const a = kit(0.02);
    a.ball(pile, '#de6a47', 0.2, 0.75, -0.9, 0.7, 0.3, 0.6);
    for (const [x, z] of [[0.5, -0.6], [-0.2, -1.2], [0.1, -0.3]] as const) a.ball(pile, '#8b4a3a', x, 0.95, z, 0.22);
    // A white flag of surrender poking out.
    a.cyl(pile, '#7a6e5e', -0.6, 1.2, -0.4, 0.03, 1.6);
    const flag = a.box(pile, '#fffdf0', -0.35, 1.8, -0.4, 0.5, 0.32, 0.02); flag.rotation.y = 0.2;
    return pile;
  }

  // ───────────────────────────── stepping ─────────────────────────────

  /** Jump straight to a step's settled look (back, mode switch, tier jump). */
  settle(step: Step) {
    this.stepRef = step;
    this.reconcile(this.stateFor(step));
    if (step.phase === 'walk') this.character.pose = 'idle';
  }

  /** Play a step forward from the previous one. */
  enter(step: Step) {
    this.stepRef = step;
    const prevWindow = this.window;
    const keepWin = prevWindow && (step.phase === 'walk' || step.phase === 'boss');
    if (keepWin) this.window = null; // keep it alive for its exit animation
    const s = this.stateFor(step);
    switch (step.phase) {
      case 'walk': this.reconcile(s); this.exitWindow(prevWindow!); this.startWalk(step); break;
      case 'problem': this.enterProblem(step, s); break;
      case 'fixed': this.enterFixed(step, s); break;
      case 'boss': this.reconcile(s); if (keepWin) this.exitWindow(prevWindow!); this.enterBoss(s); break;
      case 'bossPart': this.enterBossPart(step, s); break;
      case 'bossDown': this.enterBossDown(step, s); break;
      case 'tool': this.reconcile(s); if (this.player === 'p2') this.character.fire(); break;
      default: this.reconcile(s);
    }
  }

  private after(seconds: number, fn: () => void) { this.cues.push({ at: this.clock + seconds, fn }); }
  private tween(dur: number, fn: (k: number) => void, done?: () => void) { this.tweens.push({ age: 0, dur, fn, done }); }
  private track<T extends { dispose(): void }>(t: T) { this.temps.push(t); return t; }

  private exitWindow(w: { win: CodeWindow } | null) {
    if (!w) return;
    const win = w.win;
    const entry = this.track({ dispose: () => win.dispose() });
    const from = win.group.position.clone(), s0 = win.group.scale.x;
    const p1 = this.player === 'p1';
    this.tween(0.7, (k) => {
      const e = ease.inOutCubic(k);
      const to = p1 ? this.debtSlot(this.debt.length - 1) : this.character.muzzleWorld();
      win.group.position.lerpVectors(from, to, e);
      win.group.scale.setScalar(lerp(s0, p1 ? 0.2 : 0.02, e));
      win.group.rotation.z = e * (p1 ? 0.3 : 4);
    }, () => {
      if (!p1) this.fx.burst(this.character.muzzleWorld(), { colors: ['#aee5a3', '#f9db48'], n: 18, speed: 3 });
      win.dispose(); this.temps.splice(this.temps.indexOf(entry), 1);
    });
  }

  private startWalk(step: Step) {
    const tier = this.tier!;
    const to = step.stop < tier.stops.length ? standZ(step.stop) : standZ(tier.stops.length);
    const from = this.character.root.position.z;
    const r = rng(500 + step.tier * 31 + step.stop * 7);
    const spawns: { at: number; kind: EnemyKind; seed: number }[] = [];
    const count = 7 + Math.floor(r() * 3);
    for (let i = 0; i < count; i++) {
      const roll = r();
      spawns.push({ at: 0.04 + (i / count) * 0.72 + r() * 0.05, kind: roll < 0.45 ? 'spaghetti' : roll < 0.75 ? 'bug' : 'robot', seed: Math.floor(r() * 1e6) });
    }
    this.walk = { from, to, u: 0, spawns, next: 0 };
    this.character.pose = 'walk';
  }

  /** Director drives walking so both players stay in lockstep. u: 0 → 1. */
  setWalk(u: number) {
    const w = this.walk;
    if (!w) return;
    w.u = u;
    this.character.root.position.z = lerp(w.from, w.to, ease.inOutCubic(u) * 0.15 + u * 0.85);
    while (w.next < w.spawns.length && w.spawns[w.next]!.at <= u) this.spawn(w.spawns[w.next++]!);
    if (u >= 1) { this.character.pose = 'idle'; }
  }

  private spawn(sp: { kind: EnemyKind; seed: number }) {
    const r = rng(sp.seed);
    const z0 = this.character.root.position.z - 18 - r() * 8;
    const side = r() < 0.5 ? -1 : 1;
    let from: THREE.Vector3, to: THREE.Vector3, speed: number;
    if (sp.kind === 'spaghetti') { from = new THREE.Vector3(side * 3, 0, z0); to = new THREE.Vector3(-side * 1.5, 0, z0 + 10); speed = 2.2; }
    else if (sp.kind === 'bug') { from = new THREE.Vector3(side * 5, 0, z0); to = new THREE.Vector3(-side * 5, 0, z0 + 4); speed = 3.2; }
    else { from = new THREE.Vector3(side * 9, 0, z0 - 4); to = new THREE.Vector3(-side * 9, 0, z0 + 2); speed = 2.6; }
    const e = new Enemy(sp.kind, sp.seed, from, to, speed);
    this.enemies.push(e);
    this.scene.add(e.group);
  }

  private enterProblem(step: Step, s: State) {
    // Arrive with no window, then the angry card flies down the road and slams in.
    const before = this.player === 'p1' ? healthAt(this.game, { ...step, phase: 'walk' }, 'p1') : 100;
    this.reconcile(s);
    this.clearStreet();
    const w = this.window!;
    w.reading = false;
    const g = w.win.group;
    g.visible = false;
    this.health = before;
    this.gates[step.stop]!.state = 'idle';
    this.character.pose = 'idle';
    this.after(0.2, () => { this.gates[step.stop]!.state = 'alarm'; });
    const launch = 1.5, flight = 0.5;
    this.after(launch, () => {
      g.visible = true;
      const start = this.character.root.position.clone().add(new THREE.Vector3(0, 6, -34));
      const chest = this.character.chestWorld();
      this.tween(flight, (k) => {
        const e = ease.inCubic(k);
        g.position.lerpVectors(start, chest.clone().add(new THREE.Vector3(0, 0.6, -0.6)), e);
        g.scale.setScalar(lerp(0.35, 0.55, e));
        g.rotation.set(0, 0, (1 - e) * 2.5);
        g.quaternion.premultiply(new THREE.Quaternion());
        this.faceCamera(g);
      });
    });
    this.after(launch + flight, () => {
      this.sfx('slam'); this.sfx('damage', 0.8);
      this.character.hit();
      this.shake = 1;
      const chest = this.character.chestWorld();
      this.fx.burst(chest, { colors: ['#ff5d4f', '#ffae59', '#fff3b0'], n: 40, speed: 7 });
      this.fx.ring(chest, '#ff5d4f', 1.6, 0.4, false, this.camera.position);
      this.fx.text(chest.clone().add(new THREE.Vector3(0, 1.2, 0)), `−${Math.round(90 / this.tier!.stops.length)}%`, '#ff8b69', 1.0, 1.4);
      const from = this.health;
      this.tween(0.5, (k) => { this.health = lerp(from, s.health, ease.outCubic(k)); });
      this.character.pose = s.pose;
      // Bounce back into the reading spot.
      const hitPos = g.position.clone(), hitScale = g.scale.x;
      this.tween(0.55, (k) => {
        const e = ease.outBack(k);
        const target = this.readingPose(w.win);
        g.position.lerpVectors(hitPos, target.pos, e);
        g.scale.setScalar(lerp(hitScale, target.scale, e));
        this.faceCamera(g);
      }, () => { w.reading = true; });
    });
  }

  private enterFixed(step: Step, s: State) {
    this.reconcile(s);
    const stop = this.tier!.stops[step.stop]!;
    const fixed = this.window!;
    if (this.player === 'p1') return;
    fixed.reading = true;
    fixed.win.group.visible = false;
    const old = this.track(this.makeStopWindow(stop, 'problem'));
    old.rattle = 0.4;
    this.scene.add(old.group);
    const pose = this.readingPose(old);
    old.group.position.copy(pose.pos); old.group.scale.setScalar(pose.scale); this.faceCamera(old.group);
    this.health = 100 - 90 / this.tier!.stops.length;
    this.gates[step.stop]!.state = 'alarm';
    this.character.pose = 'aim';
    this.after(0.45, () => {
      this.character.fire();
      const from = this.character.muzzleWorld(), to = old.group.position.clone();
      this.fx.muzzle(from, '#aee5a3');
      this.fx.beam(from, to);
      this.fx.ring(to, '#aee5a3', 2.5, 0.5, false, this.camera.position);
      this.sfx('cardPlay');
    });
    this.after(0.65, () => { old.crack(3); this.sfx('glassCrack'); });
    this.after(0.85, () => { old.crack(9, 0.3, 0.6); old.crack(13, 0.75, 0.35); });
    this.after(1.05, () => {
      this.sfx('shatter');
      const from = this.character.muzzleWorld();
      old.shatter(this.debris, from.setY(from.y - 1), 7, this.shape === 'tall' ? [5, 7] : [7, 5], 21 + step.stop);
      this.temps.splice(this.temps.indexOf(old), 1);
      this.shake = 0.5;
    });
    this.after(1.3, () => {
      this.sfx('codeFix');
      fixed.win.group.visible = true;
      const g = fixed.win.group;
      fixed.reading = false;
      this.tween(0.6, (k) => {
        const t = this.readingPose(fixed.win);
        g.position.copy(t.pos).add(new THREE.Vector3(0, (1 - ease.outBack(k)) * 3, 0));
        g.scale.setScalar(t.scale * lerp(0.6, 1, ease.outBack(k)));
        this.faceCamera(g);
      }, () => { fixed.reading = true; });
      this.gates[step.stop]!.state = 'open';
    });
    this.after(1.7, () => {
      this.sfx('heal');
      this.fx.heal(this.character.root.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
      this.fx.text(this.character.chestWorld().add(new THREE.Vector3(0, 1.4, 0)), '+100% HP', '#aee5a3', 1.0, 1.6);
      const from = this.health;
      this.tween(0.8, (k) => { this.health = lerp(from, 100, ease.outCubic(k)); });
      this.character.pose = 'victory';
      this.after(1.2, () => { this.character.pose = 'idle'; });
    });
  }

  private enterBoss(s: State) {
    this.clearStreet();
    const boss = this.boss!;
    const home = boss.group.position.clone();
    boss.group.position.y = home.y + 26;
    this.after(0.9, () => this.sfx('bossArrive'));
    this.tween(1.3, (k) => { boss.group.position.y = home.y + 26 * (1 - ease.outCubic(clamp01(k))); }, () => {
      this.shake = 1.2; boss.shake = 1;
      this.fx.burst(home.clone().setY(0.2), { n: 60, colors: ['#ffae59', '#ff6d21', '#f4f4e8'], speed: 10 });
    });
    this.tween(0.001, () => void 0);
    if (this.player === 'p1') {
      // Player 1 has nothing that works: shots bounce off.
      [2.6, 3.0, 3.4].forEach((t) => this.after(t, () => this.shootBoss()));
    }
    void s;
  }

  private enterBossPart(step: Step, s: State) {
    if (this.player === 'p1') {
      this.reconcile({ ...s, pose: step.part === 0 ? 'hurt' : 'down', health: step.part === 0 ? healthAt(this.game, { ...step, phase: 'boss' }, 'p1') : 0 });
      this.after(0.2, () => this.shootBoss());
      this.after(0.5, () => this.shootBoss());
      if (step.part === 0) {
        // The boss finishes player 1 with one blow.
        this.after(0.9, () => {
          const blow = this.track(new CodeWindow(this.paint(this.tier!.stops[0]!.p1, 'angry', 'problem', 30, this.tier!.stops[0]!), 2.2, 'angry'));
          this.scene.add(blow.group);
          const from = this.boss!.partWorld(0), to = this.character.chestWorld();
          this.tween(0.45, (k) => { blow.group.position.lerpVectors(from, to, ease.inCubic(k)); blow.group.rotation.z = k * 6; }, () => {
            this.sfx('slam'); this.sfx('lose');
            this.shake = 1.4; this.character.hit(); this.character.pose = 'down';
            this.fx.burst(to, { n: 50, colors: ['#ff5d4f', '#ffae59'], speed: 8 });
            this.fx.text(to.clone().add(new THREE.Vector3(0, 1.4, 0)), 'K.O.', '#ff5d4f', 1.3, 1.8);
            blow.shatter(this.debris, from, 5, [3, 2]);
            this.temps.splice(this.temps.indexOf(blow), 1);
            const h0 = this.health;
            this.tween(0.6, (k) => { this.health = lerp(h0, 0, k); });
          });
        });
      }
      return;
    }
    // Player 2 fires the tool earned at that stop at the matching part.
    this.reconcile({ ...s, broken: step.part });
    const boss = this.boss!;
    this.bossLeft = this.bossTotal - step.part;
    const part = this.tier!.boss.parts[step.part]!;
    const tool = toolFor(this.game, part.beatenBy);
    this.after(0.25, () => {
      this.character.fire();
      const from = this.character.muzzleWorld(), to = boss.partWorld(step.part);
      this.fx.muzzle(from, '#f9db48');
      this.sfx('cardPlay');
      const card = this.track(toolBolt(tool.name));
      this.scene.add(card.group);
      this.tween(0.4, (k) => { card.group.position.lerpVectors(from, to, ease.inCubic(k)); card.group.rotation.z = k * 8; this.faceCamera(card.group, true); }, () => {
        this.fx.beam(from, to, '#f9db48');
        this.fx.burst(to, { n: 50, colors: ['#f9db48', '#aee5a3', '#fff'], speed: 9 });
        this.fx.text(to.clone().add(new THREE.Vector3(0, 1.8, 0)), tool.name.split('(')[0]!.trim().split(' ').slice(0, 2).join(' '), '#f9db48', 1.1, 1.6);
        boss.breakPart(step.part, this.debris, from);
        this.sfx('bossPartBreak');
        this.bossLeft = this.bossTotal - step.part - 1;
        this.shake = 0.8;
        card.dispose(); this.temps.splice(this.temps.indexOf(card), 1);
        const h0 = this.health;
        this.tween(0.6, (k) => { this.health = lerp(h0, s.health, k); });
      });
    });
  }

  private enterBossDown(_step: Step, s: State) {
    if (this.player === 'p1') {
      this.reconcile({ ...s, pile: false });
      // Spaghetti rains down and buries them.
      const pile = this.makePile();
      this.pile = pile; this.scene.add(pile);
      pile.position.set(0, 9, s.z);
      this.tween(0.9, (k) => { pile.position.y = 9 * (1 - ease.outCubic(k)); }, () => { this.shake = 0.7; this.fx.burst(pile.position.clone().setY(0.4), { n: 40, colors: ['#f3d27a', '#de6a47'], speed: 6 }); });
      this.after(0.2, () => this.sfx('lose', 0.6));
      return;
    }
    this.reconcile({ ...s, boss: 'alive', broken: this.bossTotal, pose: 'aim' });
    const boss = this.boss!;
    this.bossLeft = 0;
    this.after(0.3, () => {
      this.character.fire();
      const from = this.character.muzzleWorld(), to = boss.core.group.getWorldPosition(new THREE.Vector3());
      this.fx.beam(from, to, '#f9db48');
      boss.core.crack(5); this.sfx('glassCrack');
    });
    this.after(0.7, () => { boss.core.crack(17, 0.3, 0.4); boss.core.crack(23, 0.7, 0.7); boss.shake = 1; });
    this.after(1.1, () => {
      const at = boss.core.group.getWorldPosition(new THREE.Vector3());
      boss.destroy(this.debris, this.character.muzzleWorld().setY(0));
      this.boss = null;
      this.sfx('bossDefeat'); this.sfx('shatter');
      this.shake = 1.5;
      this.fx.confetti(at, 200);
      this.fx.ring(at, '#f9db48', 6, 0.8, false, this.camera.position);
      this.character.pose = 'victory';
    });
    this.after(1.6, () => this.sfx('win'));
  }

  /** Tidy the street when a stop begins: remaining enemies poof away. */
  private clearStreet() {
    for (const e of this.enemies) { this.fx.burst(e.center(), { n: 10, colors: ['#f4f4e8', '#aee5a3'], speed: 3 }); disposeTree(e.group); }
    this.enemies = [];
  }

  // ───────────────────────────── shooting ─────────────────────────────

  /** Aim at a point on screen (normalised device coords); fire if asked. Returns true when something was hit. */
  pointer(ndc: THREE.Vector2 | null, fire: boolean): boolean {
    if (!ndc) { this.aim = null; return false; }
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = this.pick(ray.ray);
    const point = hit?.point ?? ray.ray.at(30, new THREE.Vector3());
    this.aim = point;
    if (fire) this.fireAt(point, hit?.enemy ?? null, hit?.boss ?? false);
    return !!hit;
  }

  private pick(ray: THREE.Ray): { point: THREE.Vector3; enemy?: Enemy; boss?: boolean } | null {
    let best: { point: THREE.Vector3; enemy?: Enemy; boss?: boolean } | null = null, bestD = Infinity;
    const c = new THREE.Vector3();
    for (const e of this.enemies) {
      e.center(c);
      const sphere = new THREE.Sphere(c, e.radius * 1.15);
      const p = ray.intersectSphere(sphere, new THREE.Vector3());
      if (p) { const d = p.distanceTo(ray.origin); if (d < bestD) { bestD = d; best = { point: p, enemy: e }; } }
    }
    if (this.boss && !best) {
      const box = new THREE.Box3().setFromObject(this.boss.core.group);
      const p = ray.intersectBox(box, new THREE.Vector3());
      if (p) best = { point: p, boss: true };
    }
    return best;
  }

  private fireAt(point: THREE.Vector3, enemy: Enemy | null, boss: boolean) {
    const from = this.character.muzzleWorld();
    this.character.fire();
    this.shots++;
    const p1 = this.player === 'p1';
    this.fx.muzzle(from, p1 ? '#ff9ad5' : '#ffdc85');
    this.fx.tracer(from, point, p1 ? '#ff9ad5' : '#fff1a8', p1 ? 0.04 : 0.07);
    this.sfx(p1 ? 'shootP1' : 'shoot', 0.7);
    if (enemy) {
      this.sfx('enemyHit', 0.6);
      this.fx.burst(point, { n: 12, speed: 5 });
      if (enemy.hit()) this.kill(enemy, from);
    } else if (boss) {
      if (p1 || this.boss) this.bounce(point);
    } else {
      this.fx.burst(point.y < 0.3 ? point.setY(0.05) : point, { n: 5, speed: 2, colors: ['#f4f4e8'] });
    }
  }

  private shootBoss() {
    if (!this.boss) return;
    const to = this.boss.core.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, 0.6));
    this.character.aimAt(to);
    this.fireAt(to, null, true);
  }

  /** A useless shot bounces off with a plink. */
  private bounce(at: THREE.Vector3) {
    this.sfx('bounce', 0.8);
    this.fx.burst(at, { n: 14, colors: ['#ffffff', '#ffae59'], speed: 6 });
    this.fx.ring(at, '#ffffff', 0.8, 0.25, false, this.camera.position);
    const back = at.clone().add(new THREE.Vector3(Math.random() * 2, 3 + Math.random() * 2, 4 + Math.random() * 3));
    this.fx.tracer(at, back, '#ffffff', 0.03);
    if (Math.random() < 0.6) this.fx.text(at.clone().add(new THREE.Vector3(0, 1, 0)), 'NO EFFECT', '#ffffff', 0.7, 0.9);
  }

  private kill(e: Enemy, from: THREE.Vector3) {
    const at = e.center();
    this.enemies.splice(this.enemies.indexOf(e), 1);
    this.score += SCORE[e.kind];
    this.sfx(e.kind === 'robot' ? 'robotBreak' : 'enemyPop');
    this.fx.burst(at, { n: e.kind === 'robot' ? 50 : 30, speed: 8, colors: e.kind === 'spaghetti' ? ['#f3d27a', '#de6a47', '#fff3b0'] : e.kind === 'bug' ? ['#de6a47', '#173e35', '#f9db48'] : ['#e0ebee', '#76e4f9', '#f8c355'] });
    this.fx.ring(at, '#f9db48', 1.4, 0.35, false, this.camera.position);
    this.fx.text(at.clone().add(new THREE.Vector3(0, 1, 0)), `+${SCORE[e.kind]}`, '#f9db48', 0.8, 1);
    this.debris.breakObject(e.group, { from: from.clone().lerp(at, 0.7), power: 6, up: 5, life: 3.5 });
    this.shake = Math.max(this.shake, 0.25);
  }

  /** Autoplay: a seeded hand that drifts onto the nearest enemy ahead and fires like a person would. */
  private autoShoot(dt: number) {
    const me = this.character.root.position;
    const ahead = (e: Enemy) => e.group.position.z < me.z - 3 && e.group.position.z > me.z - 30;
    // Stay on the current target while it is still there; otherwise take the nearest one ahead.
    let target = this.enemies.find((e) => e.seed === this.autoTarget && ahead(e));
    target ??= this.enemies.filter(ahead).sort((a, b) => b.group.position.z - a.group.position.z)[0];
    this.autoTarget = target?.seed ?? -1;
    const rest = me.clone().add(new THREE.Vector3(0, 1.2, -14));
    const shot = this.gunner.update(dt, target ? { id: target.seed, centre: target.center(), radius: target.radius } : null, rest);
    this.aim = this.gunner.aim;
    if (!shot) return;
    // Where the hand points is where the shot goes: a pulled shot really misses.
    const dir = shot.at.clone().sub(this.camera.position).normalize();
    const hit = this.pick(new THREE.Ray(this.camera.position.clone(), dir));
    this.fireAt(hit?.point ?? shot.at, hit?.enemy ?? null, false);
  }

  /** An enemy reached the end of its path alive. */
  private slip(e: Enemy) {
    // Enemies often slip past right beside the camera; say it a few steps up the road instead.
    const at = e.center().add(new THREE.Vector3(0, 1.1, 0));
    at.z = Math.min(at.z, this.character.root.position.z - 6);
    at.x = THREE.MathUtils.clamp(at.x, -3, 3);
    if (this.player === 'p1') {
      this.shipped++;
      this.fx.text(at, 'BUG SHIPPED', '#ff5d4f', 0.8, 1.2);
      this.sfx('bounce', 0.5);
    } else {
      this.fx.text(at, 'CAUGHT BY CI', '#8ef08a', 0.8, 1.2);
    }
    this.onSlip?.(e.kind);
  }

  /** Autoplay's aim on screen (normalised device coords), for its reticle. */
  autoAimScreen(): THREE.Vector2 | null {
    if (!this.autoplay || !this.walk || !this.gunner.aim) return null;
    const p = this.gunner.aim.clone().project(this.camera);
    return p.z < 1 ? new THREE.Vector2(p.x, p.y) : null;
  }

  // ───────────────────────────── per frame ─────────────────────────────

  private debtSlot(i: number) {
    const c = this.character.root.position;
    const t = this.clock;
    // Above and beside player 1's far shoulder: off the follow camera's lens, behind the stop window in side views.
    return new THREE.Vector3(-1.1 - (i % 2) * 0.7, 2.8 + Math.floor(i / 2) * 0.5 + Math.sin(t * 2 + i) * 0.1, c.z - 0.3 - (i % 3) * 0.35);
  }

  /** Where a stop window sits so the code is as big as possible, with the character beside or below it. */
  private readingPose(win: CodeWindow) {
    const z = this.character.root.position.z;
    if (this.shape === 'tall') return { pos: new THREE.Vector3(0, 2.45 + win.h / 2, z - win.w / 2 + 0.6), scale: 1 };
    return { pos: new THREE.Vector3(0, Math.max(0.5 + win.h / 2, 2.3), z - 0.8 - win.w / 2), scale: 1 };
  }

  private faceCamera(o: THREE.Object3D, keepRoll = false) {
    const roll = o.rotation.z;
    o.quaternion.copy(this.camera.quaternion);
    if (keepRoll) o.rotateZ(roll);
  }

  setAspect(aspect: number) {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    if (this.boss && this.state) this.boss.group.position.z = this.state.z - this.bossBack();
    const shape: Shape = aspect < 1.25 ? 'tall' : 'wide';
    if (shape !== this.shape) {
      this.shape = shape;
      // Re-lay the stop window for the new shape.
      if (this.state && this.stepRef) { const keep = this.health; this.reconcile(this.state); this.health = keep; }
    }
  }

  private updateCamera(dt: number) {
    const c = this.character.root.position;
    let pos: THREE.Vector3, look: THREE.Vector3;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    if (this.camMode === 'follow') {
      pos = c.clone().add(new THREE.Vector3(1.7, 2.6, 5.4));
      look = c.clone().add(new THREE.Vector3(0.5, 1.7, -9));
      if (this.aspect < 1.25) { pos.add(new THREE.Vector3(-0.4, 0.6, 1.6)); }
    } else if (this.camMode === 'boss' && this.bossLayout) {
      ({ pos, look } = this.bossShot(c, fov));
    } else if (this.camMode === 'portrait') {
      // Front three-quarter, character low in frame so the result text sits above them.
      pos = c.clone().add(new THREE.Vector3(2.8, 2.2, -7.2));
      look = c.clone().add(new THREE.Vector3(0, 2.3, 0));
      if (this.player === 'p1' && this.pile) { pos.add(new THREE.Vector3(0.5, 1.5, 0)); look.y = 0.6; }
    } else {
      // Side-on, like Spaghetti Busters: frame the character and the window (or boss), leaving room for the HUD.
      // Legs may sit behind the tray; the box starts at the waist.
      const box = new THREE.Box3(new THREE.Vector3(-0.6, this.camMode === 'stop' ? 1.1 : 0, c.z - 0.9), new THREE.Vector3(0.6, 2.5, c.z + 1.0));
      if (this.camMode === 'stop' && this.window) {
        const w = this.window.win, p = this.readingPose(w).pos;
        box.expandByPoint(new THREE.Vector3(0, p.y - w.h / 2, p.z - w.w / 2)).expandByPoint(new THREE.Vector3(0, p.y + w.h / 2, p.z + w.w / 2));
      }
      if (this.camMode === 'boss') box.expandByPoint(new THREE.Vector3(0, 12, c.z - 22)).expandByPoint(new THREE.Vector3(0, -0.2, c.z - 8));
      const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
      // The HUD takes the top ~20% and the tray and captions the bottom ~24%; fit the box between them.
      const top = 0.18, bottom = 0.21, usableH = 1 - top - bottom, usableW = 0.94;
      const t = Math.tan(fov / 2);
      const distH = size.y / usableH / 2 / t;
      const distW = size.z / usableW / 2 / t / this.aspect;
      const d = Math.max(distH, distW) + 0.6;
      const visibleH = 2 * d * t;
      const lift = (bottom + usableH / 2 - 0.5) * visibleH;
      look = new THREE.Vector3(0, centre.y - lift, centre.z);
      pos = new THREE.Vector3(d * 0.985, centre.y - lift + d * 0.05, centre.z + d * 0.17);
    }
    const k = 1 - Math.exp(-dt * 3.2);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      const s = this.shake * 0.12;
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    }
    this.camera.lookAt(this.camLook);
    // Side-on views look across the street, so the near side's buildings step out of the way.
    const right = this.city?.getObjectByName('city-right');
    const ahead = this.camMode === 'follow' || this.camMode === 'boss';
    if (right) right.visible = ahead;
    for (const g of this.gates) g.near.visible = ahead;
    // Keep the sun's shadow box centred on the action.
    this.sun.position.set(c.x - 14, 30, c.z + 16);
    this.sun.target.position.set(c.x, 0, c.z - 8);
  }

  /** Where the camera stands, relative to the character, in the boss fight: close behind and to one side. */
  private bossEye() {
    const tall = this.aspect < 1.25;
    return new THREE.Vector3(tall ? 1.7 : 4.3, tall ? 2.95 : 2.0, tall ? 7.4 : 8.0);
  }
  /** The boss's band on screen, as fractions from the top: under the HUD, above the character. */
  private bossBand() { return this.aspect < 1.25 ? { top: 0.245, bottom: 0.615 } : { top: 0.28, bottom: 0.72 }; }

  /** How far beyond the character the boss stands, so that all of it fits its band in this lane. */
  private bossBack() {
    const L = this.bossLayout;
    if (!L) return 20;
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2), band = this.bossBand();
    const distH = (L.top - L.bottom) / ((band.bottom - band.top) * 2 * t);
    const distW = (L.width + 0.8) / (0.94 * 2 * t * this.aspect);
    return Math.max(12, Math.max(distH, distW) - this.bossEye().z);
  }

  /**
   * Boss fight: over the character's shoulder. The whole boss (head, main window and every part)
   * fits the band between the HUD and the character's head; the character stands big in the
   * foreground, off to one side so they never cover a part.
   */
  private bossShot(c: THREE.Vector3, fov: number) {
    const L = this.bossLayout!;
    const back = this.bossBack(), t = Math.tan(fov / 2), band = this.bossBand();
    const pos = c.clone().add(this.bossEye());
    const centre = new THREE.Vector3(0, BOSS.y + (L.top + L.bottom) / 2, c.z - back);
    const d = pos.z - centre.z;
    // Aim below the boss's centre so it sits in its band, not in the middle of the screen.
    const lower = (0.5 - (band.top + band.bottom) / 2) * 2 * d * t;
    const look = new THREE.Vector3(pos.x * 0.15, centre.y - lower, centre.z);
    return { pos, look };
  }

  /** Jump the camera to its target at once (after a cut). */
  snapCamera() { this.updateCamera(1e3); }

  update(dt: number) {
    this.clock += dt;
    for (const cue of this.cues.filter((c) => c.at <= this.clock)) { this.cues.splice(this.cues.indexOf(cue), 1); cue.fn(); }
    for (const t of [...this.tweens]) {
      t.age += dt;
      const k = Math.min(1, t.age / t.dur);
      t.fn(k);
      if (k >= 1) { this.tweens.splice(this.tweens.indexOf(t), 1); t.done?.(); }
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const me = this.character.root.position;
    for (const e of [...this.enemies]) {
      e.update(dt, this.camera.position);
      if (e.finished || e.group.position.z > me.z + 4) { this.slip(e); disposeTree(e.group); this.enemies.splice(this.enemies.indexOf(e), 1); }
    }
    if (this.autoplay && this.walk) this.autoShoot(dt);
    this.character.aimAt(this.aim);
    if (this.walk && Math.floor(this.clock * 4.2) !== Math.floor((this.clock - dt) * 4.2)) this.sfx('step', 0.25);
    this.character.update(dt);
    for (const g of this.gates) g.update(dt);
    this.updateCamera(dt);
    if (this.window) {
      const w = this.window;
      if (w.reading) {
        const t = this.readingPose(w.win);
        w.win.group.position.lerp(t.pos, 1 - Math.exp(-dt * 6));
        w.win.group.scale.setScalar(lerp(w.win.group.scale.x, t.scale, 1 - Math.exp(-dt * 6)));
        this.faceCamera(w.win.group);
        w.win.group.position.y += Math.sin(this.clock * 1.6) * 0.004;
      }
      w.win.update(dt);
    }
    this.debt.forEach((d, i) => {
      // The result shot shows the spaghetti pile instead; the trailing cards would cover the stamp.
      d.win.group.visible = this.camMode !== 'portrait' && this.camMode !== 'boss';
      d.win.group.position.lerp(this.debtSlot(i), 1 - Math.exp(-dt * 4));
      this.faceCamera(d.win.group);
      d.win.group.rotateZ(Math.sin(this.clock * 3 + i) * 0.08);
      d.win.update(dt);
    });
    if (this.boss) {
      this.boss.update(dt);
      this.boss.group.lookAt(this.camera.position.x, this.boss.group.position.y, this.camera.position.z);
    }
    this.debris.step(dt);
    this.fx.update(dt);
  }

  get walking() { return !!this.walk; }
  get enemyCount() { return this.enemies.length; }
  get debrisCount() { return this.debris.count; }
  /** For tests: screen-space centre of the first enemy, if any. */
  enemyScreen(): THREE.Vector2 | null {
    const e = this.enemies[0];
    if (!e) return null;
    const p = e.center().project(this.camera);
    return new THREE.Vector2(p.x, p.y);
  }
}

/** A tool name short enough to read on a boss part from the back of the room (the tray shows it in full). */
function bossTool(name: string) {
  const words = name.split(/\s+/);
  let out = words[0]!;
  for (const w of words.slice(1)) { if ((out + ' ' + w).length > 18) break; out += ' ' + w; }
  return out;
}

/** The tool card as a projectile: a small glowing yellow card. */
function toolBolt(name: string) {
  const group = new THREE.Group();
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 340;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#f9db48'; g.beginPath(); g.roundRect(0, 0, 256, 340, 22); g.fill();
  g.strokeStyle = '#173e35'; g.lineWidth = 12; g.beginPath(); g.roundRect(8, 8, 240, 324, 16); g.stroke();
  g.fillStyle = '#173e35'; g.font = 'italic 800 46px Barlow, Impact, sans-serif'; g.textAlign = 'center';
  name.split('(')[0]!.trim().split(' ').slice(0, 3).forEach((w, i) => g.fillText(w, 128, 130 + i * 52));
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.33), mat);
  group.add(mesh);
  const light = new THREE.PointLight('#f9db48', 4, 6); group.add(light);
  return { group, dispose: () => { tex.dispose(); mat.dispose(); mesh.geometry.dispose(); group.removeFromParent(); } };
}
