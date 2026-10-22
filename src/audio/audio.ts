/**
 * Spaghetti Rig audio engine — everything is synthesised live with Web Audio.
 *
 * Graph:  deck voices -> deck.out --\
 *                                   musicBus --\
 *         sfx voices -> sfx.out ---- sfxBus ----+-> master -> compressor -> limiter -> speakers
 *                           (both buses also send to a generated-noise convolver reverb)
 *
 * Music uses a lookahead scheduler (25 ms tick, 150 ms horizon) on ctx.currentTime.
 * Every voice disconnects itself when its oscillators end.
 */
import {
  TRACKS as TRACK_LIST, tracksForTheme, midiToFreq,
  type CompiledTrack, type Theme, type LeadVoice,
} from './tracks';

export type { Theme } from './tracks';

export type Sfx =
  | 'shoot' | 'shootP1' | 'enemyHit' | 'enemyPop' | 'robotBreak' | 'slam' | 'damage'
  | 'glassCrack' | 'shatter' | 'debrisBounce' | 'cardFly' | 'cardPlay' | 'codeFix' | 'heal'
  | 'gateBanner' | 'bossArrive' | 'bossPartBreak' | 'bounce' | 'bossDefeat' | 'win' | 'lose'
  | 'vs' | 'uiMove' | 'uiSelect' | 'step';

export interface PlayOptions { pan?: number; volume?: number }

export const TRACKS: { name: string; theme: Theme; bpm: number }[] = TRACK_LIST;

const TICK_MS = 25;
const LOOKAHEAD = 0.15;
const XFADE = 1.2;
const MASTER_LEVEL = 0.9;
const MUSIC_LEVEL = 0.3;
const SFX_LEVEL = 0.8;

/** Minimum seconds between two plays of the same effect. */
const RATE_LIMIT: Partial<Record<Sfx, number>> = {
  debrisBounce: 0.04, step: 0.07, enemyHit: 0.03, shoot: 0.035, shootP1: 0.035,
  uiMove: 0.03, glassCrack: 0.04, enemyPop: 0.03, damage: 0.08, bounce: 0.06,
};
const LOW_PRIORITY = new Set<Sfx>(['debrisBounce', 'step', 'enemyHit', 'uiMove']);
const SFX_LIFE: Partial<Record<Sfx, number>> = {
  win: 3, lose: 2.6, bossArrive: 2.6, bossDefeat: 2.2, heal: 1.6, codeFix: 1.2, cardPlay: 1, shatter: 0.8,
};

interface Deck {
  track: CompiledTrack;
  out: GainNode;
  delayIn: GainNode;
  fx: AudioNode[];
  start: number;
  abs: number;
  stopAt: number | null;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

interface ToneOpts {
  type?: OscillatorType; f: number; f2?: number; dur: number; vol: number;
  attack?: number; lp?: number; detune?: number; sweep?: number;
}
interface NoiseOpts {
  filter: BiquadFilterType; f: number; f2?: number; q?: number; dur: number; vol: number; attack?: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  private decks: Deck[] = [];
  private current: Deck | null = null;
  private rotation = new Map<Theme, number>();
  private _theme: Theme = 'silent';
  private _muted = false;
  private _paused = false;
  private _trackName = '';
  private listeners: ((name: string) => void)[] = [];
  private lastPlayed = new Map<Sfx, number>();
  private activeSfx = 0;

  // ------------------------------------------------------------------ public API

  get theme(): Theme { return this._theme; }
  get trackName(): string { return this._trackName; }

  onTrackChange(cb: (name: string) => void): void { this.listeners.push(cb); }

  async unlock(): Promise<void> {
    try {
      if (!this.ctx && !this.init()) return;
      const ctx = this.ctx!;
      if (!this.current && this._theme !== 'silent') this.applyTheme();
      if (!this._paused && ctx.state !== 'running') await ctx.resume();
    } catch { /* never throw on stage */ }
  }

  setTheme(theme: Theme): void {
    if (theme === this._theme) return;
    this._theme = theme;
    if (!this.ctx) return;
    try { this.applyTheme(); } catch { /* ignore */ }
  }

  get muted(): boolean { return this._muted; }
  set muted(v: boolean) {
    this._muted = v;
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const g = this.master.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.setTargetAtTime(v ? 0 : MASTER_LEVEL, ctx.currentTime, 0.04);
  }

  get paused(): boolean { return this._paused; }
  set paused(v: boolean) {
    this._paused = v;
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const p = v ? ctx.suspend() : ctx.resume();
      p.catch(() => undefined);
    } catch { /* ignore */ }
  }

  play(sfx: Sfx, opts: PlayOptions = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this._muted || this._paused || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(sfx) ?? -1;
    if (now - last < (RATE_LIMIT[sfx] ?? 0.02)) return;
    if (this.activeSfx > (LOW_PRIORITY.has(sfx) ? 24 : 64)) return;
    this.lastPlayed.set(sfx, now);
    try { this.playSfx(sfx, now + 0.005, opts); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------ setup

  private init(): boolean {
    const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : g.webkitAudioContext;
    if (!Ctor) return false;
    let ctx: AudioContext;
    try { ctx = new Ctor({ latencyHint: 'interactive' }); } catch { return false; }
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.001; limiter.release.value = 0.1;
    comp.connect(limiter).connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : MASTER_LEVEL;
    this.master.connect(comp);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = MUSIC_LEVEL;
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = SFX_LEVEL;
    this.sfxBus.connect(this.master);

    // White noise (2 s) shared by every noisy voice.
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;

    // Generated-noise impulse response reverb (soft toy room).
    const len = Math.floor(ctx.sampleRate * 2.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    const ret = ctx.createGain();
    ret.gain.value = 0.55;
    this.reverb.connect(ret).connect(this.master);
    const mSend = ctx.createGain(); mSend.gain.value = 0.3;
    this.musicBus.connect(mSend).connect(this.reverb);
    const sSend = ctx.createGain(); sSend.gain.value = 0.12;
    this.sfxBus.connect(sSend).connect(this.reverb);

    if (this._paused) ctx.suspend().catch(() => undefined);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    return true;
  }

  // ------------------------------------------------------------------ music control

  private setTrackName(name: string): void {
    if (name === this._trackName) return;
    this._trackName = name;
    for (const cb of this.listeners) { try { cb(name); } catch { /* listener bug */ } }
  }

  private nextTrackFor(theme: Theme): CompiledTrack | null {
    const list = tracksForTheme(theme);
    if (list.length === 0) return null;
    const idx = this.rotation.get(theme) ?? 0;
    this.rotation.set(theme, idx + 1);
    return list[idx % list.length] ?? null;
  }

  private applyTheme(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const track = this.nextTrackFor(this._theme);
    for (const d of this.decks) if (d.stopAt === null) this.retire(d, now, XFADE);
    this.current = null;
    if (!track) { this.setTrackName(''); return; }
    this.current = this.createDeck(track, now + 0.06, XFADE);
    this.setTrackName(track.def.name);
  }

  /** Stop scheduling a deck at `at` and fade it out over `fade`. */
  private retire(d: Deck, at: number, fade: number): void {
    const ctx = this.ctx!;
    d.stopAt = at + fade;
    const g = d.out.gain;
    const from = Math.max(at, ctx.currentTime);
    g.cancelScheduledValues(from);
    g.setValueAtTime(g.value || 1, from);
    g.linearRampToValueAtTime(0.0001, from + fade);
  }

  private createDeck(track: CompiledTrack, start: number, fadeIn: number): Deck {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, Math.max(ctx.currentTime, start - 0.05));
    out.gain.linearRampToValueAtTime(1, start + fadeIn);
    out.connect(this.musicBus!);

    // Ping-pong dotted-8th delay for width.
    const delayIn = ctx.createGain(); delayIn.gain.value = 0.22;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2800;
    const dt = Math.min(1.5, track.stepSec * 3);
    const dL = ctx.createDelay(2); dL.delayTime.value = dt;
    const dR = ctx.createDelay(2); dR.delayTime.value = dt;
    const fbL = ctx.createGain(); fbL.gain.value = 0.4;
    const fbR = ctx.createGain(); fbR.gain.value = 0.4;
    const pL = ctx.createStereoPanner(); pL.pan.value = -0.7;
    const pR = ctx.createStereoPanner(); pR.pan.value = 0.7;
    delayIn.connect(tone).connect(dL);
    dL.connect(pL).connect(out);
    dL.connect(fbL).connect(dR);
    dR.connect(pR).connect(out);
    dR.connect(fbR).connect(dL);

    const deck: Deck = { track, out, delayIn, fx: [delayIn, tone, dL, dR, fbL, fbR, pL, pR], start, abs: 0, stopAt: null };
    this.decks.push(deck);
    return deck;
  }

  private disposeDeck(d: Deck): void {
    for (const n of d.fx) { try { n.disconnect(); } catch { /* ignore */ } }
    try { d.out.disconnect(); } catch { /* ignore */ }
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    try {
      const now = ctx.currentTime;
      const horizon = now + LOOKAHEAD;
      for (const deck of [...this.decks]) this.scheduleDeck(deck, now, horizon);
      this.decks = this.decks.filter((d) => {
        if (d.stopAt !== null && now > d.stopAt + 3) { this.disposeDeck(d); return false; }
        return true;
      });
    } catch { /* keep ticking */ }
  }

  private scheduleDeck(deck: Deck, now: number, horizon: number): void {
    const tr = deck.track;
    // After a long stall (hidden tab), jump forward instead of bursting.
    if (deck.start + deck.abs * tr.stepSec < now - 0.25) {
      deck.abs = Math.ceil((now - deck.start) / tr.stepSec);
    }
    for (let guard = 0; guard < 256; guard++) {
      const base = deck.start + deck.abs * tr.stepSec;
      if (base >= horizon) return;
      if (deck.stopAt !== null && base >= deck.stopAt) return;
      const idx = deck.abs % tr.totalSteps;
      const loop = Math.floor(deck.abs / tr.totalSteps);
      if (idx === 0 && loop > 0 && deck === this.current && loop >= tr.def.loops) {
        const list = tracksForTheme(this._theme);
        if (list.length > 1) {
          const next = this.nextTrackFor(this._theme);
          if (next) {
            this.retire(deck, base, 1.0);
            deck.stopAt = base; // hard stop scheduling; tails fade
            this.current = this.createDeck(next, base, 0.03);
            this.setTrackName(next.def.name);
            return;
          }
        }
      }
      const swing = deck.abs % 2 === 1 ? (tr.def.swing ?? 0) * tr.stepSec : 0;
      if (base >= now - 0.02) this.scheduleStep(deck, idx, loop, Math.max(now, base + swing));
      deck.abs++;
    }
  }

  private scheduleStep(deck: Deck, idx: number, loop: number, t: number): void {
    const tr = deck.track;
    const def = tr.def;
    const ev = tr.steps[idx];
    if (!ev) return;
    const mix = def.mix ?? {};
    const sp = tr.stepSec;
    const onBeat = idx % 4 === 0;
    if (ev.chord) this.padChord(deck, t, ev.chord.pad, ev.chord.len * sp, mix.pad ?? 1);
    if (ev.bass) this.bassNote(deck, t, ev.bass.midi, ev.bass.len * sp, (mix.bass ?? 1) * (onBeat ? 1 : 0.85));
    if (ev.lead) {
      const vel = (mix.lead ?? 1) * (onBeat ? 1 : 0.86);
      this.leadNote(deck, t, ev.lead.midi, ev.lead.len * sp, vel, def.lead);
      // Second time round, a quiet bell doubles the hook an octave up.
      if (loop % 2 === 1 && def.theme !== 'stop') this.bell(deck, t, ev.lead.midi + 12, 0.1 * vel, 0, 0.9);
    }
    if (ev.arp !== undefined) {
      const pan = (idx % 2 === 0 ? -0.45 : 0.45);
      if (def.arpVoice === 'bell') this.bell(deck, t, ev.arp, 0.06 * (mix.arp ?? 1), pan, 0.7);
      else this.pluck(deck, t, ev.arp, 0.075 * (mix.arp ?? 1), pan);
    }
    if (ev.comp) this.compStab(deck, t, ev.comp, mix.comp ?? 1, def.theme === 'boss');
    if (ev.perc) this.perc(deck, t, ev.perc, mix.perc ?? 1);
  }

  // ------------------------------------------------------------------ music voices

  /** Wire cleanup: when the first source ends, disconnect everything. */
  private cleanup(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    src.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch { /* ignore */ } } };
  }

  private leadNote(deck: Deck, t: number, midi: number, len: number, vel: number, voice: LeadVoice): void {
    const ctx = this.ctx!;
    const f = midiToFreq(midi);
    const pluck = voice === 'pluck';
    const dur = pluck ? Math.min(len, 0.3) : Math.max(0.08, len * 0.92);
    const end = t + dur + (pluck ? 0.25 : 0.2);
    const g = ctx.createGain();
    const peak = 0.16 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (voice === 'saw' ? 0.012 : 0.008));
    if (pluck) {
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
    } else {
      g.gain.exponentialRampToValueAtTime(peak * 0.7, t + 0.12);
      g.gain.setValueAtTime(peak * 0.7, t + dur);
      g.gain.setTargetAtTime(0.0001, t + dur, 0.05);
    }
    const nodes: AudioNode[] = [g];
    const srcs: OscillatorNode[] = [];
    const osc = (type: OscillatorType, freq: number, level: number, detune = 0): OscillatorNode => {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = freq; o.detune.value = detune;
      if (level === 1) { o.connect(target); } else {
        const og = ctx.createGain(); og.gain.value = level; o.connect(og).connect(target); nodes.push(og);
      }
      srcs.push(o); nodes.push(o);
      return o;
    };
    let target: AudioNode = g;
    if (voice === 'square' || voice === 'saw' || pluck) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = pluck ? 2 : 0.8;
      const hi = voice === 'saw' ? f * 6 : pluck ? f * 8 : f * 5;
      lp.frequency.setValueAtTime(Math.min(hi, 9000), t);
      lp.frequency.exponentialRampToValueAtTime(Math.min(f * (pluck ? 1.5 : 2.5), 6000), t + (pluck ? 0.25 : 0.4));
      lp.connect(g); nodes.push(lp); target = lp;
    }
    let main: OscillatorNode;
    switch (voice) {
      case 'triangle': main = osc('triangle', f, 1); osc('sine', f * 2, 0.12); break;
      case 'sine': main = osc('sine', f, 1); osc('triangle', f, 0.3, 7); break;
      case 'square': main = osc('square', f, 0.55); osc('triangle', f, 0.6, -6); break;
      case 'saw': main = osc('sawtooth', f, 0.5, -8); osc('sawtooth', f, 0.5, 8); break;
      default: main = osc('triangle', f, 1); osc('square', f, 0.25); break;
    }
    if (!pluck && dur > 0.32) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.4;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(0, t + 0.18);
      depth.gain.linearRampToValueAtTime(f * 0.006, t + 0.45);
      lfo.connect(depth);
      for (const s of srcs) depth.connect(s.frequency);
      srcs.push(lfo); nodes.push(lfo, depth);
    }
    g.connect(deck.out);
    g.connect(deck.delayIn);
    for (const s of srcs) { s.start(t); s.stop(end); }
    this.cleanup(main, nodes);
  }

  private padChord(deck: Deck, t: number, notes: number[], len: number, level: number): void {
    const ctx = this.ctx!;
    const kind = deck.track.def.pad;
    const end = t + len + 0.9;
    const nodes: AudioNode[] = [];
    let first: OscillatorNode | null = null;
    for (const side of [-1, 1]) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
      const g = ctx.createGain();
      const pan = ctx.createStereoPanner(); pan.pan.value = side * 0.6;
      const per = (kind === 'glass' ? 0.05 : 0.04) * level;
      const vol = per * notes.length;
      if (kind === 'glass') {
        lp.frequency.value = 3200;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
        g.gain.exponentialRampToValueAtTime(vol * 0.45, t + 0.9);
      } else {
        lp.frequency.setValueAtTime(kind === 'dark' ? 450 : 700, t);
        lp.frequency.linearRampToValueAtTime(kind === 'dark' ? 800 : 1500, t + Math.min(len * 0.5, 1.2));
        lp.frequency.linearRampToValueAtTime(kind === 'dark' ? 600 : 1000, t + len);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.25);
      }
      g.gain.setValueAtTime(kind === 'glass' ? vol * 0.45 : vol, t + len);
      g.gain.setTargetAtTime(0.0001, t + len, 0.22);
      lp.connect(g).connect(pan).connect(deck.out);
      nodes.push(lp, g, pan);
      for (const n of notes) {
        const o = ctx.createOscillator();
        o.type = kind === 'glass' ? 'triangle' : 'sawtooth';
        o.frequency.value = midiToFreq(n);
        o.detune.value = side * (kind === 'glass' ? 5 : 9) + rand(-2, 2);
        const og = ctx.createGain(); og.gain.value = 1 / notes.length;
        o.connect(og).connect(lp);
        nodes.push(o, og);
        o.start(t); o.stop(end);
        first ??= o;
      }
    }
    if (first) this.cleanup(first, nodes);
  }

  private bassNote(deck: Deck, t: number, midi: number, len: number, level: number): void {
    const ctx = this.ctx!;
    const f = midiToFreq(midi);
    const dur = Math.max(0.08, Math.min(len * 0.85, 1.6));
    const g = ctx.createGain();
    const peak = 0.24 * level;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(peak * 0.6, t + 0.15);
    g.gain.setValueAtTime(peak * 0.6, t + dur);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.04);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f;
    o1.connect(lp); o2.connect(lp); lp.connect(g).connect(deck.out);
    const end = t + dur + 0.25;
    o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
    this.cleanup(o1, [o1, o2, lp, g]);
  }

  private pluck(deck: Deck, t: number, midi: number, vol: number, pan: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = midiToFreq(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    o.connect(g).connect(p).connect(deck.out);
    g.connect(deck.delayIn);
    o.start(t); o.stop(t + 0.26);
    this.cleanup(o, [o, g, p]);
  }

  private bell(deck: Deck, t: number, midi: number, vol: number, pan: number, decay: number): void {
    const ctx = this.ctx!;
    const f = midiToFreq(midi);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 3.01;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.25, t); g2.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    o.connect(g); o2.connect(g2).connect(g);
    g.connect(p).connect(deck.out);
    g.connect(deck.delayIn);
    o.start(t); o2.start(t); o.stop(t + decay + 0.02); o2.stop(t + decay + 0.02);
    this.cleanup(o, [o, o2, g2, g, p]);
  }

  private compStab(deck: Deck, t: number, notes: number[], level: number, dark: boolean): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const vol = 0.06 * level;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = dark ? 1400 : 2600;
    lp.connect(g).connect(deck.out);
    const nodes: AudioNode[] = [g, lp];
    let first: OscillatorNode | null = null;
    for (const n of notes) {
      const o = ctx.createOscillator(); o.type = dark ? 'square' : 'triangle';
      o.frequency.value = midiToFreq(n + (dark ? 0 : 12));
      const og = ctx.createGain(); og.gain.value = 1 / notes.length;
      o.connect(og).connect(lp);
      o.start(t); o.stop(t + 0.18);
      nodes.push(o, og);
      first ??= o;
    }
    if (first) this.cleanup(first, nodes);
  }

  private perc(deck: Deck, t: number, kind: 't' | 'T' | 's', level: number): void {
    const ctx = this.ctx!;
    if (!this.noiseBuf) return;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = kind === 's' ? 'bandpass' : 'highpass';
    f.frequency.value = kind === 's' ? 8500 : 7000;
    f.Q.value = kind === 's' ? 1.2 : 0.7;
    const g = ctx.createGain();
    const vol = (kind === 'T' ? 0.07 : kind === 's' ? 0.04 : 0.04) * level;
    const dur = kind === 's' ? 0.09 : 0.035;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (kind === 's' ? 0.03 : 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner(); p.pan.value = rand(-0.35, 0.35);
    src.connect(f).connect(g).connect(p).connect(deck.out);
    src.start(t, rand(0, 1.8)); src.stop(t + dur + 0.02);
    this.cleanup(src, [src, f, g, p]);
  }

  // ------------------------------------------------------------------ sfx helpers

  private sfxOut(opts: PlayOptions, life: number): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain(); g.gain.value = clamp(opts.volume ?? 1, 0, 1);
    const p = ctx.createStereoPanner(); p.pan.value = clamp(opts.pan ?? 0, -1, 1);
    g.connect(p).connect(this.sfxBus!);
    this.activeSfx++;
    setTimeout(() => {
      this.activeSfx--;
      try { g.disconnect(); p.disconnect(); } catch { /* ignore */ }
    }, (life + 0.4) * 1000);
    return g;
  }

  private tone(dest: AudioNode, t: number, o: ToneOpts): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + o.dur * (o.sweep ?? 1));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const a = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, o.dur));
    const nodes: AudioNode[] = [osc, g];
    if (o.lp) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp;
      osc.connect(lp).connect(g); nodes.push(lp);
    } else osc.connect(g);
    g.connect(dest);
    osc.start(t); osc.stop(t + o.dur + 0.02);
    this.cleanup(osc, nodes);
  }

  private noise(dest: AudioNode, t: number, o: NoiseOpts): void {
    const ctx = this.ctx!;
    if (!this.noiseBuf) return;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = o.filter; f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2 !== undefined) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    const g = ctx.createGain();
    const a = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, o.dur));
    src.connect(f).connect(g).connect(dest);
    const dur = Math.min(o.dur + 0.02, 1.95);
    src.start(t, rand(0, 2 - dur)); src.stop(t + dur);
    this.cleanup(src, [src, f, g]);
  }

  /** Brass-like synth note: detuned saws through an opening filter. */
  private brass(dest: AudioNode, t: number, midi: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const f = midiToFreq(midi);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(f * 1.2, t);
    lp.frequency.exponentialRampToValueAtTime(Math.min(f * 7, 8000), t + 0.07);
    lp.frequency.exponentialRampToValueAtTime(Math.min(f * 3, 5000), t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol * 0.85, t + dur);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.08);
    lp.connect(g).connect(dest);
    const a = ctx.createOscillator(); a.type = 'sawtooth'; a.frequency.value = f; a.detune.value = -9;
    const b = ctx.createOscillator(); b.type = 'sawtooth'; b.frequency.value = f; b.detune.value = 9;
    a.connect(lp); b.connect(lp);
    const end = t + dur + 0.5;
    a.start(t); b.start(t); a.stop(end); b.stop(end);
    this.cleanup(a, [a, b, lp, g]);
  }

  /** Sad trombone "wah": saw with a vowel-ish filter swell and optional wobble. */
  private trombone(dest: AudioNode, t: number, midi: number, dur: number, wobble: boolean): void {
    const ctx = this.ctx!;
    const f = midiToFreq(midi);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 1.02, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    o.frequency.setValueAtTime(f, t + dur * 0.8);
    o.frequency.exponentialRampToValueAtTime(f * 0.96, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
    lp.frequency.setValueAtTime(350, t);
    lp.frequency.exponentialRampToValueAtTime(1500, t + 0.15);
    lp.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.04);
    g.gain.setValueAtTime(0.18, t + dur - 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(dest);
    const nodes: AudioNode[] = [o, lp, g];
    if (wobble) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = 6.5;
      const d = ctx.createGain();
      d.gain.setValueAtTime(0, t);
      d.gain.linearRampToValueAtTime(f * 0.035, t + dur * 0.6);
      lfo.connect(d).connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.02);
      nodes.push(lfo, d);
    }
    o.start(t); o.stop(t + dur + 0.02);
    this.cleanup(o, nodes);
  }

  // ------------------------------------------------------------------ sound effects

  private playSfx(sfx: Sfx, t: number, opts: PlayOptions): void {
    const out = this.sfxOut(opts, SFX_LIFE[sfx] ?? 0.6);
    const n = (midi: number): number => midiToFreq(midi);
    switch (sfx) {
      case 'shoot': {
        this.tone(out, t, { type: 'square', f: 1100, f2: 180, dur: 0.11, vol: 0.2, lp: 4200 });
        this.tone(out, t, { type: 'sine', f: 190, f2: 45, dur: 0.16, vol: 0.5 });
        this.noise(out, t, { filter: 'bandpass', f: 2600, q: 0.8, dur: 0.06, vol: 0.28 });
        break;
      }
      case 'shootP1': {
        const p = rand(0.93, 1.07);
        this.tone(out, t, { type: 'square', f: 2400 * p, f2: 650 * p, dur: 0.14, vol: 0.09, lp: 5000 });
        this.tone(out, t, { type: 'triangle', f: 1500 * p, f2: 3300 * p, dur: 0.06, vol: 0.08 });
        this.tone(out, t + 0.01, { type: 'sawtooth', f: 320 * p, f2: 150 * p, dur: 0.1, vol: 0.05, lp: 1300 });
        break;
      }
      case 'enemyHit': {
        this.noise(out, t, { filter: 'highpass', f: 2500, dur: 0.05, vol: 0.28 });
        this.tone(out, t, { type: 'triangle', f: rand(600, 800), f2: 330, dur: 0.07, vol: 0.18 });
        break;
      }
      case 'enemyPop': {
        this.noise(out, t, { filter: 'bandpass', f: 900, f2: 280, q: 1.2, dur: 0.18, vol: 0.4 });
        this.tone(out, t, { type: 'sine', f: 300, f2: rand(1200, 1600), dur: 0.07, vol: 0.3 });
        this.tone(out, t + 0.05, { type: 'triangle', f: n(pick([84, 86, 88, 91, 93])), dur: 0.14, vol: 0.1 });
        break;
      }
      case 'robotBreak': {
        this.tone(out, t, { type: 'sine', f: 170, f2: 55, dur: 0.22, vol: 0.4 });
        let ti = t;
        for (let i = 0; i < 6; i++) {
          const f = rand(900, 3400);
          this.tone(out, ti, { type: 'square', f, f2: f * 0.96, dur: rand(0.05, 0.13), vol: 0.06, lp: 6500 });
          this.noise(out, ti, { filter: 'bandpass', f: f * 1.5, q: 9, dur: 0.07, vol: 0.35 });
          ti += rand(0.03, 0.07);
        }
        this.tone(out, t + 0.08, { type: 'triangle', f: 650, f2: 180, dur: 0.32, vol: 0.06 });
        break;
      }
      case 'slam': {
        this.tone(out, t, { type: 'sine', f: 115, f2: 36, dur: 0.42, vol: 0.85 });
        this.noise(out, t, { filter: 'lowpass', f: 600, f2: 120, dur: 0.3, vol: 0.55 });
        this.noise(out, t + 0.01, { filter: 'highpass', f: 4200, dur: 0.2, vol: 0.18 });
        for (let i = 0; i < 4; i++) {
          this.tone(out, t + rand(0.005, 0.06), { type: 'sine', f: rand(2600, 6200), dur: rand(0.1, 0.3), vol: 0.05 });
        }
        break;
      }
      case 'damage': {
        this.tone(out, t, { type: 'square', f: 640, f2: 540, dur: 0.09, vol: 0.12, lp: 2600 });
        this.tone(out, t + 0.09, { type: 'square', f: 450, f2: 290, dur: 0.18, vol: 0.12, lp: 2000 });
        this.tone(out, t, { type: 'sine', f: 150, f2: 60, dur: 0.15, vol: 0.3 });
        break;
      }
      case 'glassCrack': {
        for (let i = 0; i < 5; i++) {
          this.noise(out, t + rand(0, 0.1), { filter: 'highpass', f: rand(2500, 4500), dur: 0.015, vol: 0.32, attack: 0.001 });
        }
        this.tone(out, t, { type: 'sine', f: rand(4800, 5600), f2: 4400, dur: 0.09, vol: 0.05 });
        break;
      }
      case 'shatter': {
        this.noise(out, t, { filter: 'highpass', f: 2600, dur: 0.5, vol: 0.32, attack: 0.002 });
        this.noise(out, t, { filter: 'lowpass', f: 800, dur: 0.12, vol: 0.32 });
        this.tone(out, t, { type: 'sine', f: 210, f2: 55, dur: 0.25, vol: 0.5 });
        for (let i = 0; i < 9; i++) {
          this.tone(out, t + rand(0, 0.35), { type: 'triangle', f: rand(2200, 7500), dur: rand(0.06, 0.25), vol: rand(0.03, 0.07) });
        }
        break;
      }
      case 'debrisBounce': {
        this.tone(out, t, { type: 'triangle', f: rand(1400, 3600), dur: rand(0.025, 0.05), vol: rand(0.035, 0.065) });
        break;
      }
      case 'cardFly': {
        this.noise(out, t, { filter: 'bandpass', f: 500, f2: 3500, q: 2, dur: 0.42, vol: 0.28, attack: 0.15 });
        const shimmer = [88, 91, 93, 96, 98];
        for (let i = 0; i < 4; i++) {
          this.tone(out, t + 0.15 + i * 0.05, { type: 'sine', f: n(pick(shimmer)), dur: 0.25, vol: 0.04 });
        }
        break;
      }
      case 'cardPlay': {
        this.tone(out, t, { type: 'sine', f: 220, f2: 1320, dur: 0.25, vol: 0.14 });
        this.noise(out, t, { filter: 'highpass', f: 5000, dur: 0.2, vol: 0.12 });
        [72, 76, 79, 84, 88].forEach((m, i) => {
          this.tone(out, t + i * 0.035, { type: 'triangle', f: n(m), dur: 0.42, vol: 0.11 });
        });
        this.tone(out, t + 0.18, { type: 'sine', f: n(96), dur: 0.55, vol: 0.05, attack: 0.01 });
        break;
      }
      case 'codeFix': {
        [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96, 98].forEach((m, i) => {
          this.tone(out, t + i * 0.045, { type: 'sine', f: n(m), dur: 0.3, vol: 0.065 });
        });
        this.noise(out, t, { filter: 'bandpass', f: 1000, f2: 8000, q: 3, dur: 0.6, vol: 0.12, attack: 0.3 });
        break;
      }
      case 'heal': {
        [65, 69, 72, 76, 79, 84].forEach((m, i) => {
          const ti = t + i * 0.09;
          this.tone(out, ti, { type: 'sine', f: n(m), dur: 1.0, vol: 0.1, attack: 0.008 });
          this.tone(out, ti, { type: 'triangle', f: n(m + 12), dur: 0.4, vol: 0.03 });
        });
        break;
      }
      case 'gateBanner': {
        const sting = (ti: number, m: number, d: number): void => {
          this.tone(out, ti, { type: 'triangle', f: n(m), dur: d, vol: 0.18 });
          this.tone(out, ti, { type: 'square', f: n(m), dur: d, vol: 0.05, lp: 3000 });
          this.tone(out, ti, { type: 'sine', f: n(m + 12), dur: d * 0.8, vol: 0.05 });
        };
        sting(t, 79, 0.14);
        sting(t + 0.12, 84, 0.55);
        break;
      }
      case 'bossArrive': {
        for (const m of [38, 45, 50, 51, 53]) this.brass(out, t, m, 1.5, 0.075);
        this.tone(out, t, { type: 'sine', f: 58, f2: 34, dur: 2.0, vol: 0.5, attack: 0.02 });
        this.noise(out, t, { filter: 'lowpass', f: 180, f2: 90, dur: 2.2, vol: 0.5, attack: 0.3 });
        break;
      }
      case 'bossPartBreak': {
        this.noise(out, t, { filter: 'bandpass', f: 1500, f2: 400, q: 1, dur: 0.3, vol: 0.42 });
        this.tone(out, t, { type: 'square', f: 320, f2: 70, dur: 0.25, vol: 0.12, lp: 2000 });
        this.tone(out, t, { type: 'sine', f: 600, f2: 150, dur: 0.2, vol: 0.3 });
        this.tone(out, t + 0.12, { type: 'triangle', f: n(88), dur: 0.2, vol: 0.1 });
        this.tone(out, t + 0.2, { type: 'triangle', f: n(95), dur: 0.35, vol: 0.1 });
        break;
      }
      case 'bounce': {
        const ctx = this.ctx!;
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(240, t);
        o.frequency.exponentialRampToValueAtTime(430, t + 0.42);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 17;
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(150, t);
        depth.gain.exponentialRampToValueAtTime(4, t + 0.42);
        lfo.connect(depth).connect(o.frequency);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        o.connect(g).connect(out);
        o.start(t); lfo.start(t); o.stop(t + 0.47); lfo.stop(t + 0.47);
        this.cleanup(o, [o, lfo, depth, g]);
        this.tone(out, t, { type: 'triangle', f: 2300, dur: 0.05, vol: 0.12 });
        break;
      }
      case 'bossDefeat': {
        this.noise(out, t, { filter: 'lowpass', f: 3000, f2: 150, dur: 1.6, vol: 0.6, attack: 0.005 });
        this.tone(out, t, { type: 'sine', f: 120, f2: 28, dur: 1.0, vol: 0.8 });
        [67, 72, 76, 79, 84, 88].forEach((m, i) => {
          this.tone(out, t + 0.35 + i * 0.07, { type: 'triangle', f: n(m), dur: 0.5, vol: 0.12 });
        });
        for (const m of [60, 64, 67, 72]) this.brass(out, t + 0.8, m, 0.9, 0.06);
        break;
      }
      case 'win': {
        const seq: [number, number, number][] = [[67, 0, 0.15], [72, 0.17, 0.15], [76, 0.34, 0.15], [79, 0.51, 0.42], [76, 0.98, 0.14], [79, 1.15, 1.25]];
        for (const [m, at, d] of seq) {
          this.brass(out, t + at, m, d, 0.11);
          this.tone(out, t + at, { type: 'triangle', f: n(m + 12), dur: d + 0.1, vol: 0.05 });
        }
        for (const m of [48, 55, 60, 64, 67]) this.brass(out, t + 1.15, m, 1.25, 0.05);
        [84, 88, 91, 96].forEach((m, i) => {
          this.tone(out, t + 1.2 + i * 0.08, { type: 'sine', f: n(m), dur: 0.8, vol: 0.05 });
        });
        break;
      }
      case 'lose': {
        [58, 57, 56].forEach((m, i) => this.trombone(out, t + i * 0.42, m, 0.4, false));
        this.trombone(out, t + 1.26, 55, 0.95, true);
        break;
      }
      case 'vs': {
        this.tone(out, t, { type: 'sine', f: 160, f2: 40, dur: 0.5, vol: 0.8 });
        this.noise(out, t, { filter: 'lowpass', f: 3000, f2: 300, dur: 0.35, vol: 0.5 });
        this.noise(out, t, { filter: 'highpass', f: 6000, dur: 0.08, vol: 0.22 });
        for (const m of [40, 47, 52, 55]) this.brass(out, t, m, 0.3, 0.07);
        break;
      }
      case 'uiMove': {
        this.tone(out, t, { type: 'sine', f: rand(1650, 1750), dur: 0.03, vol: 0.08 });
        break;
      }
      case 'uiSelect': {
        this.tone(out, t, { type: 'triangle', f: 880, dur: 0.07, vol: 0.12 });
        this.tone(out, t + 0.06, { type: 'triangle', f: 1320, dur: 0.15, vol: 0.12 });
        break;
      }
      case 'step': {
        this.noise(out, t, { filter: 'lowpass', f: rand(250, 450), dur: 0.05, vol: 0.12 });
        break;
      }
    }
  }
}
