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
  TRACKS as TRACK_LIST,
  tracksForTheme,
  midiToFreq,
  SEMITONES_PER_OCTAVE,
  STEPS_PER_BEAT,
  type CompiledTrack,
  type Theme,
  type LeadVoice,
} from "./tracks";
import { present } from "../nth";
import rawSfx from "./sfx.json";
import { expandSfx, parseSfx } from "./sfx";

export type { Theme } from "./tracks";

export type Sfx =
  | "shoot"
  | "shootP1"
  | "enemyHit"
  | "enemyPop"
  | "robotBreak"
  | "slam"
  | "damage"
  | "glassCrack"
  | "shatter"
  | "debrisBounce"
  | "cardFly"
  | "cardPlay"
  | "codeFix"
  | "heal"
  | "gateBanner"
  | "bossArrive"
  | "bossPartBreak"
  | "bounce"
  | "bossDefeat"
  | "win"
  | "lose"
  | "vs"
  | "uiMove"
  | "uiSelect"
  | "step";

export interface PlayOptions {
  pan?: number;
  volume?: number;
}

/** The effects whose voices are written as data in sfx.json; the rest are still played by playSfx below. */
const RECIPES = parseSfx(rawSfx);

export const TRACKS: { name: string; theme: Theme; bpm: number }[] = TRACK_LIST;

const TICK_MS = 25;
const LOOKAHEAD = 0.15;
const XFADE = 1.2;
const MASTER_LEVEL = 0.9;
const MUSIC_LEVEL = 0.3;
const SFX_LEVEL = 0.8;
/** The quietest a gain ramp may reach: an exponential ramp cannot end at 0. */
const SILENCE = 0.0001;
/** Seconds a gain change on the master takes to settle (mute and unmute). */
const MUTE_FADE = 0.04;
/** A new sound effect starts this long after it is asked for, so it is never scheduled in the past. */
const SFX_START_DELAY = 0.005;
/** How many sound effects may overlap before a new one is dropped (a low-priority one is dropped sooner). */
const SFX_VOICE_CAP = 64;
const LOW_PRIORITY_VOICE_CAP = 24;
/** The soft toy-room reverb: its length in seconds and how sharply its noise dies away. */
const REVERB_SECONDS = 2.2;
const REVERB_DECAY_POWER = 3.2;
/** A new theme's first track starts this long after the theme is set. */
const THEME_START_DELAY = 0.06;
/** A deck's gain starts rising this long before its first step. */
const DECK_FADE_LEAD = 0.05;
/** The ping-pong delay is at most this long, and one dotted eighth is three steps. */
const DELAY_MAX_SECONDS = 1.5;
const DELAY_STEPS = 3;
/** A deck that has stopped scheduling is kept this long for its tails to ring out, then disposed. */
const DECK_TAIL_SECONDS = 3;
/** If the scheduler falls this far behind (a hidden tab), it jumps forward instead of bursting. */
const STALL_SECONDS = 0.25;
/** The scheduler plays at most this many steps in one tick. */
const SCHEDULE_GUARD = 256;
/** The next track of a theme fades in this fast. */
const NEXT_DECK_FADE_IN = 0.03;
/** A sound effect's output is kept this long after its tail, and a tone or noise voice's gain behaves as follows. */
const SFX_TAIL_SECONDS = 0.4;
const MS_PER_SECOND = 1000;
const DEFAULT_TONE_ATTACK = 0.004;
const DEFAULT_NOISE_ATTACK = 0.003;
const DEFAULT_NOISE_Q = 0.8;
/** A tone ramps to at least this peak, and its decay lasts at least this long after its attack. */
const MIN_PEAK = 0.0002;
const MIN_DECAY = 0.01;
/** An oscillator or noise source is stopped this long after its gain has died away. */
const STOP_PADDING = 0.02;
/** The shared noise buffer is two seconds long, so a noise voice may last at most this long. */
const NOISE_MAX_SECONDS = 1.95;
/** A step this far in the past is still played. */
const LATE_STEP_SECONDS = 0.02;
/** Off the beat the bass and the lead play this much softer. */
const OFFBEAT_BASS = 0.85;
const OFFBEAT_LEAD = 0.86;
/** The second time round a quiet bell doubles the hook an octave up. */
const HOOK_BELL_LEVEL = 0.1;
const HOOK_BELL_DECAY = 0.9;
/** The arpeggio swings between the speakers, and plays as a bell or a pluck. */
const ARP_PAN = 0.45;
const ARP_BELL_LEVEL = 0.06;
const ARP_BELL_DECAY = 0.7;
const ARP_PLUCK_LEVEL = 0.075;

/** Minimum seconds between two plays of the same effect: the chattiest effects, shots, crackles, steps, damage and bounces. */
const CHATTY_GAP = 0.03;
const SHOOT_GAP = 0.035;
const CRACKLE_GAP = 0.04;
const STEP_GAP = 0.07;
const DAMAGE_GAP = 0.08;
const BOUNCE_GAP = 0.06;
/** The gap for every effect not listed here. */
const DEFAULT_GAP = 0.02;
const RATE_LIMIT: Partial<Record<Sfx, number>> = {
  debrisBounce: CRACKLE_GAP,
  step: STEP_GAP,
  enemyHit: CHATTY_GAP,
  shoot: SHOOT_GAP,
  shootP1: SHOOT_GAP,
  uiMove: CHATTY_GAP,
  glassCrack: CRACKLE_GAP,
  enemyPop: CHATTY_GAP,
  damage: DAMAGE_GAP,
  bounce: BOUNCE_GAP,
};
const LOW_PRIORITY = new Set<Sfx>([
  "debrisBounce",
  "step",
  "enemyHit",
  "uiMove",
]);
/** Seconds an effect's output stays connected before it is torn down: the longest tail it can have. */
const WIN_LIFE = 3;
const LOSE_LIFE = 2.6;
const BOSS_ARRIVE_LIFE = 2.6;
const BOSS_DEFEAT_LIFE = 2.2;
const HEAL_LIFE = 1.6;
const CODE_FIX_LIFE = 1.2;
const SHATTER_LIFE = 0.8;
const SFX_LIFE: Partial<Record<Sfx, number>> = {
  win: WIN_LIFE,
  lose: LOSE_LIFE,
  bossArrive: BOSS_ARRIVE_LIFE,
  bossDefeat: BOSS_DEFEAT_LIFE,
  heal: HEAL_LIFE,
  codeFix: CODE_FIX_LIFE,
  cardPlay: 1,
  shatter: SHATTER_LIFE,
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
const clamp = (v: number, a: number, b: number): number =>
  Math.min(b, Math.max(a, v));

export interface ToneOpts {
  type?: OscillatorType;
  f: number;
  f2?: number;
  dur: number;
  vol: number;
  attack?: number;
  lp?: number;
  detune?: number;
  sweep?: number;
}
export interface NoiseOpts {
  filter: BiquadFilterType;
  f: number;
  f2?: number;
  q?: number;
  dur: number;
  vol: number;
  attack?: number;
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
  private readonly rotation = new Map<Theme, number>();
  private _theme: Theme = "silent";
  private _muted = false;
  private _paused = false;
  private _trackName = "";
  private readonly listeners: ((name: string) => void)[] = [];
  private readonly lastPlayed = new Map<Sfx, number>();
  private activeSfx = 0;

  // ------------------------------------------------------------------ public API

  get theme(): Theme {
    return this._theme;
  }

  get trackName(): string {
    return this._trackName;
  }

  onTrackChange(cb: (name: string) => void): void {
    this.listeners.push(cb);
  }

  async unlock(): Promise<void> {
    try {
      if (!this.ctx && !this.init()) {
        return;
      }

      const ctx = this.audioContext;

      if (!this.current && this._theme !== "silent") {
        this.applyTheme();
      }

      if (!this._paused && ctx.state !== "running") {
        await ctx.resume();
      }
    } catch {
      /* never throw on stage */
    }
  }

  setTheme(theme: Theme): void {
    if (theme === this._theme) {
      return;
    }

    this._theme = theme;
    if (!this.ctx) {
      return;
    }

    try {
      this.applyTheme();
    } catch {
      /* ignore */
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(v: boolean) {
    this._muted = v;

    const ctx = this.ctx;

    if (!ctx || !this.master) {
      return;
    }

    const g = this.master.gain;

    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.setTargetAtTime(v ? 0 : MASTER_LEVEL, ctx.currentTime, MUTE_FADE);
  }

  get paused(): boolean {
    return this._paused;
  }

  set paused(v: boolean) {
    this._paused = v;

    const ctx = this.ctx;

    if (!ctx) {
      return;
    }

    try {
      const p = v ? ctx.suspend() : ctx.resume();

      p.catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  play(sfx: Sfx, opts: PlayOptions = {}): void {
    const ctx = this.ctx;

    if (
      !ctx ||
      !this.sfxBus ||
      this._muted ||
      this._paused ||
      ctx.state !== "running"
    ) {
      return;
    }

    const now = ctx.currentTime;
    const last = this.lastPlayed.get(sfx) ?? -1;

    if (now - last < (RATE_LIMIT[sfx] ?? DEFAULT_GAP)) {
      return;
    }

    if (
      this.activeSfx >
      (LOW_PRIORITY.has(sfx) ? LOW_PRIORITY_VOICE_CAP : SFX_VOICE_CAP)
    ) {
      return;
    }

    this.lastPlayed.set(sfx, now);
    try {
      this.playSfx(sfx, now + SFX_START_DELAY, opts);
    } catch {
      /* ignore */
    }
  }

  /** The audio context. Methods that play sound run after init() has made it; one that runs earlier is a bug. */
  private get audioContext(): AudioContext {
    return present(this.ctx, "the audio context");
  }

  private get musicBusNode(): GainNode {
    return present(this.musicBus, "the music bus");
  }

  private get sfxBusNode(): GainNode {
    return present(this.sfxBus, "the sfx bus");
  }

  // ------------------------------------------------------------------ setup

  private init(): boolean {
    const Ctor =
      typeof AudioContext === "undefined"
        ? globalThis.webkitAudioContext
        : AudioContext;

    if (!Ctor) {
      return false;
    }

    let ctx: AudioContext;

    try {
      ctx = new Ctor({ latencyHint: "interactive" });
    } catch {
      return false;
    }

    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();

    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;

    const limiter = ctx.createDynamicsCompressor();

    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
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

    for (let i = 0; i < nd.length; i++) {
      nd[i] = Math.random() * 2 - 1;
    }

    this.noiseBuf = nb;

    // Generated-noise impulse response reverb (soft toy room).
    const len = Math.floor(ctx.sampleRate * REVERB_SECONDS);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);

      for (let i = 0; i < len; i++) {
        d[i] =
          (Math.random() * 2 - 1) * Math.pow(1 - i / len, REVERB_DECAY_POWER);
      }
    }

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;

    const ret = ctx.createGain();

    ret.gain.value = 0.55;
    this.reverb.connect(ret).connect(this.master);

    const mSend = ctx.createGain();

    mSend.gain.value = 0.3;
    this.musicBus.connect(mSend).connect(this.reverb);

    const sSend = ctx.createGain();

    sSend.gain.value = 0.12;
    this.sfxBus.connect(sSend).connect(this.reverb);

    if (this._paused) {
      ctx.suspend().catch(() => undefined);
    }

    this.timer = setInterval(() => this.tick(), TICK_MS);

    return true;
  }

  // ------------------------------------------------------------------ music control

  private setTrackName(name: string): void {
    if (name === this._trackName) {
      return;
    }

    this._trackName = name;
    for (const cb of this.listeners) {
      try {
        cb(name);
      } catch {
        /* listener bug */
      }
    }
  }

  private nextTrackFor(theme: Theme): CompiledTrack | null {
    const list = tracksForTheme(theme);

    if (list.length === 0) {
      return null;
    }

    const idx = this.rotation.get(theme) ?? 0;

    this.rotation.set(theme, idx + 1);

    return list[idx % list.length] ?? null;
  }

  private applyTheme(): void {
    const ctx = this.ctx;

    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    const track = this.nextTrackFor(this._theme);

    for (const d of this.decks) {
      if (d.stopAt === null) {
        this.retire(d, now, XFADE);
      }
    }

    this.current = null;
    if (!track) {
      this.setTrackName("");

      return;
    }

    this.current = this.createDeck(track, now + THEME_START_DELAY, XFADE);
    this.setTrackName(track.def.name);
  }

  /** Stop scheduling a deck at `at` and fade it out over `fade`. */
  private retire(d: Deck, at: number, fade: number): void {
    const ctx = this.audioContext;

    d.stopAt = at + fade;

    const g = d.out.gain;
    const from = Math.max(at, ctx.currentTime);

    g.cancelScheduledValues(from);
    g.setValueAtTime(g.value || 1, from);
    g.linearRampToValueAtTime(SILENCE, from + fade);
  }

  private createDeck(
    track: CompiledTrack,
    start: number,
    fadeIn: number,
  ): Deck {
    const ctx = this.audioContext;
    const out = ctx.createGain();

    out.gain.setValueAtTime(
      SILENCE,
      Math.max(ctx.currentTime, start - DECK_FADE_LEAD),
    );
    out.gain.linearRampToValueAtTime(1, start + fadeIn);
    out.connect(this.musicBusNode);

    // Ping-pong dotted-8th delay for width.
    const delayIn = ctx.createGain();

    delayIn.gain.value = 0.22;

    const tone = ctx.createBiquadFilter();

    tone.type = "lowpass";
    tone.frequency.value = 2800;

    const dt = Math.min(DELAY_MAX_SECONDS, track.stepSec * DELAY_STEPS);
    const dL = ctx.createDelay(2);

    dL.delayTime.value = dt;

    const dR = ctx.createDelay(2);

    dR.delayTime.value = dt;

    const fbL = ctx.createGain();

    fbL.gain.value = 0.4;

    const fbR = ctx.createGain();

    fbR.gain.value = 0.4;

    const pL = ctx.createStereoPanner();

    pL.pan.value = -0.7;

    const pR = ctx.createStereoPanner();

    pR.pan.value = 0.7;
    delayIn.connect(tone).connect(dL);
    dL.connect(pL).connect(out);
    dL.connect(fbL).connect(dR);
    dR.connect(pR).connect(out);
    dR.connect(fbR).connect(dL);

    const deck: Deck = {
      track,
      out,
      delayIn,
      fx: [delayIn, tone, dL, dR, fbL, fbR, pL, pR],
      start,
      abs: 0,
      stopAt: null,
    };

    this.decks.push(deck);

    return deck;
  }

  private disposeDeck(d: Deck): void {
    for (const n of d.fx) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }

    try {
      d.out.disconnect();
    } catch {
      /* ignore */
    }
  }

  private tick(): void {
    const ctx = this.ctx;

    if (ctx?.state !== "running") {
      return;
    }

    try {
      const now = ctx.currentTime;
      const horizon = now + LOOKAHEAD;
      // Iterate a snapshot: scheduleDeck can roll over to a new track, and createDeck pushes onto decks.
      const decksAtTickStart = this.decks.slice();

      for (const deck of decksAtTickStart) {
        this.scheduleDeck(deck, now, horizon);
      }

      this.decks = this.decks.filter((d) => {
        if (d.stopAt !== null && now > d.stopAt + DECK_TAIL_SECONDS) {
          this.disposeDeck(d);

          return false;
        }

        return true;
      });
    } catch {
      /* keep ticking */
    }
  }

  private scheduleDeck(deck: Deck, now: number, horizon: number): void {
    const tr = deck.track;

    // After a long stall (hidden tab), jump forward instead of bursting.
    if (deck.start + deck.abs * tr.stepSec < now - STALL_SECONDS) {
      deck.abs = Math.ceil((now - deck.start) / tr.stepSec);
    }

    for (let guard = 0; guard < SCHEDULE_GUARD; guard++) {
      const base = deck.start + deck.abs * tr.stepSec;

      if (base >= horizon) {
        return;
      }

      if (deck.stopAt !== null && base >= deck.stopAt) {
        return;
      }

      const idx = deck.abs % tr.totalSteps;
      const loop = Math.floor(deck.abs / tr.totalSteps);

      if (
        idx === 0 &&
        loop > 0 &&
        deck === this.current &&
        loop >= tr.def.loops
      ) {
        const list = tracksForTheme(this._theme);

        if (list.length > 1) {
          const next = this.nextTrackFor(this._theme);

          if (next) {
            this.retire(deck, base, 1.0);
            deck.stopAt = base; // hard stop scheduling; tails fade
            this.current = this.createDeck(next, base, NEXT_DECK_FADE_IN);
            this.setTrackName(next.def.name);

            return;
          }
        }
      }

      const swing = deck.abs % 2 === 1 ? (tr.def.swing ?? 0) * tr.stepSec : 0;

      if (base >= now - LATE_STEP_SECONDS) {
        this.scheduleStep(deck, idx, loop, Math.max(now, base + swing));
      }

      deck.abs++;
    }
  }

  private scheduleStep(deck: Deck, idx: number, loop: number, t: number): void {
    const tr = deck.track;
    const def = tr.def;
    const ev = tr.steps[idx];

    if (!ev) {
      return;
    }

    const mix = def.mix ?? {};
    const sp = tr.stepSec;
    const onBeat = idx % STEPS_PER_BEAT === 0;

    if (ev.chord) {
      this.padChord(deck, t, ev.chord.pad, ev.chord.len * sp, mix.pad ?? 1);
    }

    if (ev.bass) {
      this.bassNote(
        deck,
        t,
        ev.bass.midi,
        ev.bass.len * sp,
        (mix.bass ?? 1) * (onBeat ? 1 : OFFBEAT_BASS),
      );
    }

    if (ev.lead) {
      const vel = (mix.lead ?? 1) * (onBeat ? 1 : OFFBEAT_LEAD);

      this.leadNote(deck, t, ev.lead.midi, ev.lead.len * sp, vel, def.lead);
      // Second time round, a quiet bell doubles the hook an octave up.
      if (loop % 2 === 1 && def.theme !== "stop") {
        this.bell(
          deck,
          t,
          ev.lead.midi + SEMITONES_PER_OCTAVE,
          HOOK_BELL_LEVEL * vel,
          0,
          HOOK_BELL_DECAY,
        );
      }
    }

    if (ev.arp !== undefined) {
      const pan = idx % 2 === 0 ? -ARP_PAN : ARP_PAN;

      if (def.arpVoice === "bell") {
        this.bell(
          deck,
          t,
          ev.arp,
          ARP_BELL_LEVEL * (mix.arp ?? 1),
          pan,
          ARP_BELL_DECAY,
        );
      } else {
        this.pluck(deck, t, ev.arp, ARP_PLUCK_LEVEL * (mix.arp ?? 1), pan);
      }
    }

    if (ev.comp) {
      this.compStab(deck, t, ev.comp, mix.comp ?? 1, def.theme === "boss");
    }

    if (ev.perc) {
      this.perc(deck, t, ev.perc, mix.perc ?? 1);
    }
  }

  // ------------------------------------------------------------------ music voices

  /** Wire cleanup: when the first source ends, disconnect everything. */
  private cleanup(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    src.onended = () => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    };
  }

  private leadNote(
    deck: Deck,
    t: number,
    midi: number,
    len: number,
    vel: number,
    voice: LeadVoice,
  ): void {
    const ctx = this.audioContext;
    const f = midiToFreq(midi);
    const pluck = voice === "pluck";
    const dur = pluck ? Math.min(len, 0.3) : Math.max(0.08, len * 0.92);
    const end = t + dur + (pluck ? 0.25 : 0.2);
    const g = ctx.createGain();
    const peak = 0.16 * vel;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(
      peak,
      t + (voice === "saw" ? 0.012 : 0.008),
    );
    if (pluck) {
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
    } else {
      g.gain.exponentialRampToValueAtTime(peak * 0.7, t + 0.12);
      g.gain.setValueAtTime(peak * 0.7, t + dur);
      g.gain.setTargetAtTime(0.0001, t + dur, 0.05);
    }

    const nodes: AudioNode[] = [g];
    const srcs: OscillatorNode[] = [];
    const osc = (
      type: OscillatorType,
      freq: number,
      level: number,
      detune = 0,
    ): OscillatorNode => {
      const o = ctx.createOscillator();

      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      if (level === 1) {
        o.connect(target);
      } else {
        const og = ctx.createGain();

        og.gain.value = level;
        o.connect(og).connect(target);
        nodes.push(og);
      }

      srcs.push(o);
      nodes.push(o);

      return o;
    };

    let target: AudioNode = g;

    if (voice === "square" || voice === "saw" || pluck) {
      const lp = ctx.createBiquadFilter();

      lp.type = "lowpass";
      lp.Q.value = pluck ? 2 : 0.8;

      const hi = voice === "saw" ? f * 6 : pluck ? f * 8 : f * 5;

      lp.frequency.setValueAtTime(Math.min(hi, 9000), t);
      lp.frequency.exponentialRampToValueAtTime(
        Math.min(f * (pluck ? 1.5 : 2.5), 6000),
        t + (pluck ? 0.25 : 0.4),
      );
      lp.connect(g);
      nodes.push(lp);
      target = lp;
    }

    let main: OscillatorNode;

    switch (voice) {
      case "triangle":
        main = osc("triangle", f, 1);
        osc("sine", f * 2, 0.12);
        break;
      case "sine":
        main = osc("sine", f, 1);
        osc("triangle", f, 0.3, 7);
        break;
      case "square":
        main = osc("square", f, 0.55);
        osc("triangle", f, 0.6, -6);
        break;
      case "saw":
        main = osc("sawtooth", f, 0.5, -8);
        osc("sawtooth", f, 0.5, 8);
        break;
      default:
        main = osc("triangle", f, 1);
        osc("square", f, 0.25);
        break;
    }

    if (!pluck && dur > 0.32) {
      const lfo = ctx.createOscillator();

      lfo.frequency.value = 5.4;

      const depth = ctx.createGain();

      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(0, t + 0.18);
      depth.gain.linearRampToValueAtTime(f * 0.006, t + 0.45);
      lfo.connect(depth);
      for (const s of srcs) {
        depth.connect(s.frequency);
      }

      srcs.push(lfo);
      nodes.push(lfo, depth);
    }

    g.connect(deck.out);
    g.connect(deck.delayIn);
    for (const s of srcs) {
      s.start(t);
      s.stop(end);
    }

    this.cleanup(main, nodes);
  }

  private padChord(
    deck: Deck,
    t: number,
    notes: number[],
    len: number,
    level: number,
  ): void {
    const ctx = this.audioContext;
    const kind = deck.track.def.pad;
    const end = t + len + 0.9;
    const nodes: AudioNode[] = [];
    let first: OscillatorNode | null = null;

    for (const side of [-1, 1]) {
      const lp = ctx.createBiquadFilter();

      lp.type = "lowpass";
      lp.Q.value = 0.5;

      const g = ctx.createGain();
      const pan = ctx.createStereoPanner();

      pan.pan.value = side * 0.6;

      const per = (kind === "glass" ? 0.05 : 0.04) * level;
      const vol = per * notes.length;

      if (kind === "glass") {
        lp.frequency.value = 3200;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
        g.gain.exponentialRampToValueAtTime(vol * 0.45, t + 0.9);
      } else {
        lp.frequency.setValueAtTime(kind === "dark" ? 450 : 700, t);
        lp.frequency.linearRampToValueAtTime(
          kind === "dark" ? 800 : 1500,
          t + Math.min(len * 0.5, 1.2),
        );
        lp.frequency.linearRampToValueAtTime(
          kind === "dark" ? 600 : 1000,
          t + len,
        );
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.25);
      }

      g.gain.setValueAtTime(kind === "glass" ? vol * 0.45 : vol, t + len);
      g.gain.setTargetAtTime(0.0001, t + len, 0.22);
      lp.connect(g).connect(pan).connect(deck.out);
      nodes.push(lp, g, pan);
      for (const n of notes) {
        const o = ctx.createOscillator();

        o.type = kind === "glass" ? "triangle" : "sawtooth";
        o.frequency.value = midiToFreq(n);
        o.detune.value = side * (kind === "glass" ? 5 : 9) + rand(-2, 2);

        const og = ctx.createGain();

        og.gain.value = 1 / notes.length;
        o.connect(og).connect(lp);
        nodes.push(o, og);
        o.start(t);
        o.stop(end);
        first ??= o;
      }
    }

    if (first) {
      this.cleanup(first, nodes);
    }
  }

  private bassNote(
    deck: Deck,
    t: number,
    midi: number,
    len: number,
    level: number,
  ): void {
    const ctx = this.audioContext;
    const f = midiToFreq(midi);
    const dur = Math.max(0.08, Math.min(len * 0.85, 1.6));
    const g = ctx.createGain();
    const peak = 0.24 * level;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(peak * 0.6, t + 0.15);
    g.gain.setValueAtTime(peak * 0.6, t + dur);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.04);

    const lp = ctx.createBiquadFilter();

    lp.type = "lowpass";
    lp.frequency.value = 700;

    const o1 = ctx.createOscillator();

    o1.type = "triangle";
    o1.frequency.value = f;

    const o2 = ctx.createOscillator();

    o2.type = "sine";
    o2.frequency.value = f;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(deck.out);

    const end = t + dur + 0.25;

    o1.start(t);
    o2.start(t);
    o1.stop(end);
    o2.stop(end);
    this.cleanup(o1, [o1, o2, lp, g]);
  }

  private pluck(
    deck: Deck,
    t: number,
    midi: number,
    vol: number,
    pan: number,
  ): void {
    const ctx = this.audioContext;
    const o = ctx.createOscillator();

    o.type = "triangle";
    o.frequency.value = midiToFreq(midi);

    const g = ctx.createGain();

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);

    const p = ctx.createStereoPanner();

    p.pan.value = pan;
    o.connect(g).connect(p).connect(deck.out);
    g.connect(deck.delayIn);
    o.start(t);
    o.stop(t + 0.26);
    this.cleanup(o, [o, g, p]);
  }

  private bell(
    deck: Deck,
    t: number,
    midi: number,
    vol: number,
    pan: number,
    decay: number,
  ): void {
    const ctx = this.audioContext;
    const f = midiToFreq(midi);
    const o = ctx.createOscillator();

    o.type = "sine";
    o.frequency.value = f;

    const o2 = ctx.createOscillator();

    o2.type = "sine";
    o2.frequency.value = f * 3.01;

    const g2 = ctx.createGain();

    g2.gain.setValueAtTime(0.25, t);
    g2.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

    const g = ctx.createGain();

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);

    const p = ctx.createStereoPanner();

    p.pan.value = pan;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(p).connect(deck.out);
    g.connect(deck.delayIn);
    o.start(t);
    o2.start(t);
    o.stop(t + decay + 0.02);
    o2.stop(t + decay + 0.02);
    this.cleanup(o, [o, o2, g2, g, p]);
  }

  private compStab(
    deck: Deck,
    t: number,
    notes: number[],
    level: number,
    dark: boolean,
  ): void {
    const ctx = this.audioContext;
    const g = ctx.createGain();
    const vol = 0.06 * level;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

    const lp = ctx.createBiquadFilter();

    lp.type = "lowpass";
    lp.frequency.value = dark ? 1400 : 2600;
    lp.connect(g).connect(deck.out);

    const nodes: AudioNode[] = [g, lp];
    let first: OscillatorNode | null = null;

    for (const n of notes) {
      const o = ctx.createOscillator();

      o.type = dark ? "square" : "triangle";
      o.frequency.value = midiToFreq(n + (dark ? 0 : 12));

      const og = ctx.createGain();

      og.gain.value = 1 / notes.length;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + 0.18);
      nodes.push(o, og);
      first ??= o;
    }

    if (first) {
      this.cleanup(first, nodes);
    }
  }

  private perc(
    deck: Deck,
    t: number,
    kind: "t" | "T" | "s",
    level: number,
  ): void {
    const ctx = this.audioContext;

    if (!this.noiseBuf) {
      return;
    }

    const src = ctx.createBufferSource();

    src.buffer = this.noiseBuf;

    const f = ctx.createBiquadFilter();

    f.type = kind === "s" ? "bandpass" : "highpass";
    f.frequency.value = kind === "s" ? 8500 : 7000;
    f.Q.value = kind === "s" ? 1.2 : 0.7;

    const g = ctx.createGain();
    const vol = (kind === "T" ? 0.07 : kind === "s" ? 0.04 : 0.04) * level;
    const dur = kind === "s" ? 0.09 : 0.035;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (kind === "s" ? 0.03 : 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const p = ctx.createStereoPanner();

    p.pan.value = rand(-0.35, 0.35);
    src.connect(f).connect(g).connect(p).connect(deck.out);
    src.start(t, rand(0, 1.8));
    src.stop(t + dur + 0.02);
    this.cleanup(src, [src, f, g, p]);
  }

  // ------------------------------------------------------------------ sfx helpers

  private sfxOut(opts: PlayOptions, life: number): GainNode {
    const ctx = this.audioContext;
    const g = ctx.createGain();

    g.gain.value = clamp(opts.volume ?? 1, 0, 1);

    const p = ctx.createStereoPanner();

    p.pan.value = clamp(opts.pan ?? 0, -1, 1);
    g.connect(p).connect(this.sfxBusNode);
    this.activeSfx++;
    setTimeout(
      () => {
        this.activeSfx--;
        try {
          g.disconnect();
          p.disconnect();
        } catch {
          /* ignore */
        }
      },
      (life + SFX_TAIL_SECONDS) * MS_PER_SECOND,
    );

    return g;
  }

  private tone(dest: AudioNode, t: number, o: ToneOpts): void {
    const ctx = this.audioContext;
    const osc = ctx.createOscillator();

    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2 !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, o.f2),
        t + o.dur * (o.sweep ?? 1),
      );
    }

    if (o.detune) {
      osc.detune.value = o.detune;
    }

    const g = ctx.createGain();
    const a = o.attack ?? DEFAULT_TONE_ATTACK;

    g.gain.setValueAtTime(SILENCE, t);
    g.gain.exponentialRampToValueAtTime(Math.max(MIN_PEAK, o.vol), t + a);
    g.gain.exponentialRampToValueAtTime(
      SILENCE,
      t + Math.max(a + MIN_DECAY, o.dur),
    );

    const nodes: AudioNode[] = [osc, g];

    if (o.lp) {
      const lp = ctx.createBiquadFilter();

      lp.type = "lowpass";
      lp.frequency.value = o.lp;
      osc.connect(lp).connect(g);
      nodes.push(lp);
    } else {
      osc.connect(g);
    }

    g.connect(dest);
    osc.start(t);
    osc.stop(t + o.dur + STOP_PADDING);
    this.cleanup(osc, nodes);
  }

  private noise(dest: AudioNode, t: number, o: NoiseOpts): void {
    const ctx = this.audioContext;

    if (!this.noiseBuf) {
      return;
    }

    const src = ctx.createBufferSource();

    src.buffer = this.noiseBuf;

    const f = ctx.createBiquadFilter();

    f.type = o.filter;
    f.Q.value = o.q ?? DEFAULT_NOISE_Q;
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2 !== undefined) {
      f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    }

    const g = ctx.createGain();
    const a = o.attack ?? DEFAULT_NOISE_ATTACK;

    g.gain.setValueAtTime(SILENCE, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + a);
    g.gain.exponentialRampToValueAtTime(
      SILENCE,
      t + Math.max(a + MIN_DECAY, o.dur),
    );
    src.connect(f).connect(g).connect(dest);

    const dur = Math.min(o.dur + STOP_PADDING, NOISE_MAX_SECONDS);

    src.start(t, rand(0, 2 - dur));
    src.stop(t + dur);
    this.cleanup(src, [src, f, g]);
  }

  /** Brass-like synth note: detuned saws through an opening filter. */
  private brass(
    dest: AudioNode,
    t: number,
    midi: number,
    dur: number,
    vol: number,
  ): void {
    const ctx = this.audioContext;
    const f = midiToFreq(midi);
    const lp = ctx.createBiquadFilter();

    lp.type = "lowpass";
    lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(f * 1.2, t);
    lp.frequency.exponentialRampToValueAtTime(Math.min(f * 7, 8000), t + 0.07);
    lp.frequency.exponentialRampToValueAtTime(Math.min(f * 3, 5000), t + 0.35);

    const g = ctx.createGain();

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol * 0.85, t + dur);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.08);
    lp.connect(g).connect(dest);

    const a = ctx.createOscillator();

    a.type = "sawtooth";
    a.frequency.value = f;
    a.detune.value = -9;

    const b = ctx.createOscillator();

    b.type = "sawtooth";
    b.frequency.value = f;
    b.detune.value = 9;
    a.connect(lp);
    b.connect(lp);

    const end = t + dur + 0.5;

    a.start(t);
    b.start(t);
    a.stop(end);
    b.stop(end);
    this.cleanup(a, [a, b, lp, g]);
  }

  /** Sad trombone "wah": saw with a vowel-ish filter swell and optional wobble. */
  private trombone(
    dest: AudioNode,
    t: number,
    midi: number,
    dur: number,
    wobble: boolean,
  ): void {
    const ctx = this.audioContext;
    const f = midiToFreq(midi);
    const o = ctx.createOscillator();

    o.type = "sawtooth";
    o.frequency.setValueAtTime(f * 1.02, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    o.frequency.setValueAtTime(f, t + dur * 0.8);
    o.frequency.exponentialRampToValueAtTime(f * 0.96, t + dur);

    const lp = ctx.createBiquadFilter();

    lp.type = "lowpass";
    lp.Q.value = 4;
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
      const lfo = ctx.createOscillator();

      lfo.frequency.value = 6.5;

      const d = ctx.createGain();

      d.gain.setValueAtTime(0, t);
      d.gain.linearRampToValueAtTime(f * 0.035, t + dur * 0.6);
      lfo.connect(d).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.02);
      nodes.push(lfo, d);
    }

    o.start(t);
    o.stop(t + dur + 0.02);
    this.cleanup(o, nodes);
  }

  // ------------------------------------------------------------------ sound effects

  private playSfx(sfx: Sfx, t: number, opts: PlayOptions): void {
    const out = this.sfxOut(opts, SFX_LIFE[sfx] ?? 0.6);
    const layers = RECIPES.get(sfx);

    if (layers) {
      for (const v of expandSfx(layers, t)) {
        switch (v.kind) {
          case "tone":
            this.tone(out, v.at, v.opts);
            break;
          case "noise":
            this.noise(out, v.at, v.opts);
            break;
          case "brass":
            this.brass(out, v.at, v.midi, v.dur, v.vol);
            break;
          case "trombone":
            this.trombone(out, v.at, v.midi, v.dur, v.wobble);
            break;
        }
      }

      return;
    }

    switch (sfx) {
      case "shootP1": {
        const p = rand(0.93, 1.07);

        this.tone(out, t, {
          type: "square",
          f: 2400 * p,
          f2: 650 * p,
          dur: 0.14,
          vol: 0.09,
          lp: 5000,
        });
        this.tone(out, t, {
          type: "triangle",
          f: 1500 * p,
          f2: 3300 * p,
          dur: 0.06,
          vol: 0.08,
        });
        this.tone(out, t + 0.01, {
          type: "sawtooth",
          f: 320 * p,
          f2: 150 * p,
          dur: 0.1,
          vol: 0.05,
          lp: 1300,
        });
        break;
      }

      case "robotBreak": {
        this.tone(out, t, {
          type: "sine",
          f: 170,
          f2: 55,
          dur: 0.22,
          vol: 0.4,
        });

        let ti = t;

        for (let i = 0; i < 6; i++) {
          const f = rand(900, 3400);

          this.tone(out, ti, {
            type: "square",
            f,
            f2: f * 0.96,
            dur: rand(0.05, 0.13),
            vol: 0.06,
            lp: 6500,
          });
          this.noise(out, ti, {
            filter: "bandpass",
            f: f * 1.5,
            q: 9,
            dur: 0.07,
            vol: 0.35,
          });
          ti += rand(0.03, 0.07);
        }

        this.tone(out, t + 0.08, {
          type: "triangle",
          f: 650,
          f2: 180,
          dur: 0.32,
          vol: 0.06,
        });
        break;
      }

      case "bounce": {
        const ctx = this.audioContext;
        const o = ctx.createOscillator();

        o.type = "sine";
        o.frequency.setValueAtTime(240, t);
        o.frequency.exponentialRampToValueAtTime(430, t + 0.42);

        const lfo = ctx.createOscillator();

        lfo.frequency.value = 17;

        const depth = ctx.createGain();

        depth.gain.setValueAtTime(150, t);
        depth.gain.exponentialRampToValueAtTime(4, t + 0.42);
        lfo.connect(depth).connect(o.frequency);

        const g = ctx.createGain();

        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        o.connect(g).connect(out);
        o.start(t);
        lfo.start(t);
        o.stop(t + 0.47);
        lfo.stop(t + 0.47);
        this.cleanup(o, [o, lfo, depth, g]);
        this.tone(out, t, { type: "triangle", f: 2300, dur: 0.05, vol: 0.12 });
        break;
      }
    }
  }
}
