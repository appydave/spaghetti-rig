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
  type CompiledTrack,
  type Theme,
} from "#root/src/audio/tracks.ts";
import type { Deck } from "#root/src/audio/music/deck.ts";
import { leadNote } from "#root/src/audio/music/lead.ts";
import { padChord, compStab } from "#root/src/audio/music/chords.ts";
import { bassNote, pluck, bell, perc } from "#root/src/audio/music/hits.ts";
import {
  SILENCE,
  STOP_PADDING,
  cleanup,
  noiseVoice,
  rand,
} from "#root/src/audio/voice-kit.ts";
import {
  scheduleDeck,
  type SequencerHost,
} from "#root/src/audio/music/sequencer.ts";
import { present } from "#root/src/nth.ts";
import rawSfx from "#root/src/audio/sfx.json";
import { expandSfx, parseSfx } from "#root/src/audio/sfx.ts";

export type { Theme } from "#root/src/audio/tracks.ts";

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
/** The next track of a theme fades in this fast. */
const NEXT_DECK_FADE_IN = 0.03;
/** A sound effect's output is kept this long after its tail, and a tone or noise voice's gain behaves as follows. */
const SFX_TAIL_SECONDS = 0.4;

export const MS_PER_SECOND = 1000;

const DEFAULT_TONE_ATTACK = 0.004;
const DEFAULT_NOISE_ATTACK = 0.003;
const DEFAULT_NOISE_Q = 0.8;
/** A tone ramps to at least this peak, and its decay lasts at least this long after its attack. */
const MIN_PEAK = 0.0002;
const MIN_DECAY = 0.01;
/** The shared noise buffer is two seconds long, so a noise voice may last at most this long. */
const NOISE_MAX_SECONDS = 1.95;

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

/** The brass note: its filter opens to a multiple of the pitch (never past a ceiling) fast, then settles lower; its gain and tail. */
const BRASS_OPEN = 1.2;
const BRASS_PEAK_OPEN = 7;
const BRASS_PEAK_OPEN_MAX = 8000;
const BRASS_PEAK_AT = 0.07;
const BRASS_SETTLE_OPEN = 3;
const BRASS_SETTLE_OPEN_MAX = 5000;
const BRASS_SETTLE_AT = 0.35;
const BRASS_ATTACK = 0.03;
const BRASS_SUSTAIN = 0.85;
const BRASS_RELEASE = 0.08;
const BRASS_TAIL = 0.5;
/** The sad trombone: a scoop up into the pitch, a droop at the end, a filter swell, and an optional wobble. */
const TROMBONE_SCOOP = 1.02;
const TROMBONE_SCOOP_TIME = 0.06;
const TROMBONE_DROOP_AT = 0.8;
const TROMBONE_DROOP = 0.96;
const TROMBONE_CLOSED = 350;
const TROMBONE_OPEN = 1500;
const TROMBONE_OPEN_AT = 0.15;
const TROMBONE_END = 500;
const TROMBONE_PEAK = 0.2;
const TROMBONE_ATTACK = 0.04;
const TROMBONE_HOLD = 0.18;
const TROMBONE_FALL = 0.06;
const TROMBONE_WOBBLE_DEPTH = 0.035;
const TROMBONE_WOBBLE_FULL = 0.6;
/** An effect with no entry in the life table keeps its output this long. */
const DEFAULT_LIFE = 0.6;
/** The player-one shot: its pitch varies by this ratio, and it is a zap, a chirp and a thump (each: pitch, slide, length, level). */
const SHOOT_P1_PITCH_MIN = 0.93;
const SHOOT_P1_PITCH_MAX = 1.07;
const SHOOT_P1_ZAP_F = 2400;
const SHOOT_P1_ZAP_F2 = 650;
const SHOOT_P1_ZAP_DUR = 0.14;
const SHOOT_P1_ZAP_VOL = 0.09;
const SHOOT_P1_ZAP_LP = 5000;
const SHOOT_P1_CHIRP_F = 1500;
const SHOOT_P1_CHIRP_F2 = 3300;
const SHOOT_P1_CHIRP_DUR = 0.06;
const SHOOT_P1_CHIRP_VOL = 0.08;
const SHOOT_P1_THUMP_DELAY = 0.01;
const SHOOT_P1_THUMP_F = 320;
const SHOOT_P1_THUMP_F2 = 150;
const SHOOT_P1_THUMP_DUR = 0.1;
const SHOOT_P1_THUMP_VOL = 0.05;
const SHOOT_P1_THUMP_LP = 1300;
/** A robot breaking: a clunk, then a burst of sparks (each a square blip and a noise zap, a random gap apart), then a rumble. */
const ROBOT_CLUNK_F = 170;
const ROBOT_CLUNK_F2 = 55;
const ROBOT_CLUNK_DUR = 0.22;
const ROBOT_CLUNK_VOL = 0.4;
const ROBOT_SPARKS = 6;
const ROBOT_SPARK_MIN_F = 900;
const ROBOT_SPARK_MAX_F = 3400;
const ROBOT_SPARK_SLIDE = 0.96;
const ROBOT_SPARK_MIN_DUR = 0.05;
const ROBOT_SPARK_MAX_DUR = 0.13;
const ROBOT_SPARK_VOL = 0.06;
const ROBOT_SPARK_LP = 6500;
const ROBOT_ZAP_RATIO = 1.5;
const ROBOT_ZAP_Q = 9;
const ROBOT_ZAP_DUR = 0.07;
const ROBOT_ZAP_VOL = 0.35;
const ROBOT_SPARK_MIN_GAP = 0.03;
const ROBOT_SPARK_MAX_GAP = 0.07;
const ROBOT_RUMBLE_DELAY = 0.08;
const ROBOT_RUMBLE_F = 650;
const ROBOT_RUMBLE_F2 = 180;
const ROBOT_RUMBLE_DUR = 0.32;
const ROBOT_RUMBLE_VOL = 0.06;
/** The bounce: a sine that rises with a wobble that dies away, a short gain envelope, and a high click. */
const BOUNCE_F = 240;
const BOUNCE_F_END = 430;
const BOUNCE_SWEEP = 0.42;
const BOUNCE_WOBBLE_DEPTH = 150;
const BOUNCE_WOBBLE_END = 4;
const BOUNCE_PEAK = 0.28;
const BOUNCE_ATTACK = 0.01;
const BOUNCE_DECAY = 0.45;
const BOUNCE_STOP = 0.47;
const BOUNCE_CLICK_F = 2300;
const BOUNCE_CLICK_DUR = 0.05;
const BOUNCE_CLICK_VOL = 0.12;

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
  /** What the sequencer asks of this engine: the music voices, and rolling a finished deck over to the next track. */
  private readonly sequencer: SequencerHost = {
    voices: { padChord, bassNote, leadNote, pluck, bell, compStab, perc },
    rollOver: (deck, at) => this.rollOver(deck, at),
  };

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
      ctx,
      noise: this.noiseBuf,
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
        scheduleDeck(deck, now, horizon, this.sequencer);
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

  /** The deck has played its loops: if its theme has another track, fade this deck out and start that one at `at`. */
  private rollOver(deck: Deck, at: number): boolean {
    if (deck !== this.current || tracksForTheme(this._theme).length < 2) {
      return false;
    }

    const next = this.nextTrackFor(this._theme);

    if (!next) {
      return false;
    }

    this.retire(deck, at, 1.0);
    deck.stopAt = at; // hard stop scheduling; tails fade
    this.current = this.createDeck(next, at, NEXT_DECK_FADE_IN);
    this.setTrackName(next.def.name);

    return true;
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
    cleanup(osc, nodes);
  }

  private noise(dest: AudioNode, t: number, o: NoiseOpts): void {
    const ctx = this.audioContext;

    if (!this.noiseBuf) {
      return;
    }

    const { src, f } = noiseVoice(ctx, this.noiseBuf, o.filter);

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
    cleanup(src, [src, f, g]);
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
    lp.frequency.setValueAtTime(f * BRASS_OPEN, t);
    lp.frequency.exponentialRampToValueAtTime(
      Math.min(f * BRASS_PEAK_OPEN, BRASS_PEAK_OPEN_MAX),
      t + BRASS_PEAK_AT,
    );
    lp.frequency.exponentialRampToValueAtTime(
      Math.min(f * BRASS_SETTLE_OPEN, BRASS_SETTLE_OPEN_MAX),
      t + BRASS_SETTLE_AT,
    );

    const g = ctx.createGain();

    g.gain.setValueAtTime(SILENCE, t);
    g.gain.exponentialRampToValueAtTime(vol, t + BRASS_ATTACK);
    g.gain.setValueAtTime(vol * BRASS_SUSTAIN, t + dur);
    g.gain.setTargetAtTime(SILENCE, t + dur, BRASS_RELEASE);
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

    const end = t + dur + BRASS_TAIL;

    a.start(t);
    b.start(t);
    a.stop(end);
    b.stop(end);
    cleanup(a, [a, b, lp, g]);
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
    o.frequency.setValueAtTime(f * TROMBONE_SCOOP, t);
    o.frequency.exponentialRampToValueAtTime(f, t + TROMBONE_SCOOP_TIME);
    o.frequency.setValueAtTime(f, t + dur * TROMBONE_DROOP_AT);
    o.frequency.exponentialRampToValueAtTime(f * TROMBONE_DROOP, t + dur);

    const lp = ctx.createBiquadFilter();

    lp.type = "lowpass";
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(TROMBONE_CLOSED, t);
    lp.frequency.exponentialRampToValueAtTime(
      TROMBONE_OPEN,
      t + TROMBONE_OPEN_AT,
    );
    lp.frequency.exponentialRampToValueAtTime(TROMBONE_END, t + dur);

    const g = ctx.createGain();

    g.gain.setValueAtTime(SILENCE, t);
    g.gain.exponentialRampToValueAtTime(TROMBONE_PEAK, t + TROMBONE_ATTACK);
    g.gain.setValueAtTime(TROMBONE_HOLD, t + dur - TROMBONE_FALL);
    g.gain.exponentialRampToValueAtTime(SILENCE, t + dur);
    o.connect(lp).connect(g).connect(dest);

    const nodes: AudioNode[] = [o, lp, g];

    if (wobble) {
      const lfo = ctx.createOscillator();

      lfo.frequency.value = 6.5;

      const d = ctx.createGain();

      d.gain.setValueAtTime(0, t);
      d.gain.linearRampToValueAtTime(
        f * TROMBONE_WOBBLE_DEPTH,
        t + dur * TROMBONE_WOBBLE_FULL,
      );
      lfo.connect(d).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + STOP_PADDING);
      nodes.push(lfo, d);
    }

    o.start(t);
    o.stop(t + dur + STOP_PADDING);
    cleanup(o, nodes);
  }

  // ------------------------------------------------------------------ sound effects

  private playSfx(sfx: Sfx, t: number, opts: PlayOptions): void {
    const out = this.sfxOut(opts, SFX_LIFE[sfx] ?? DEFAULT_LIFE);
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
        const p = rand(SHOOT_P1_PITCH_MIN, SHOOT_P1_PITCH_MAX);

        this.tone(out, t, {
          type: "square",
          f: SHOOT_P1_ZAP_F * p,
          f2: SHOOT_P1_ZAP_F2 * p,
          dur: SHOOT_P1_ZAP_DUR,
          vol: SHOOT_P1_ZAP_VOL,
          lp: SHOOT_P1_ZAP_LP,
        });
        this.tone(out, t, {
          type: "triangle",
          f: SHOOT_P1_CHIRP_F * p,
          f2: SHOOT_P1_CHIRP_F2 * p,
          dur: SHOOT_P1_CHIRP_DUR,
          vol: SHOOT_P1_CHIRP_VOL,
        });
        this.tone(out, t + SHOOT_P1_THUMP_DELAY, {
          type: "sawtooth",
          f: SHOOT_P1_THUMP_F * p,
          f2: SHOOT_P1_THUMP_F2 * p,
          dur: SHOOT_P1_THUMP_DUR,
          vol: SHOOT_P1_THUMP_VOL,
          lp: SHOOT_P1_THUMP_LP,
        });
        break;
      }

      case "robotBreak": {
        this.tone(out, t, {
          type: "sine",
          f: ROBOT_CLUNK_F,
          f2: ROBOT_CLUNK_F2,
          dur: ROBOT_CLUNK_DUR,
          vol: ROBOT_CLUNK_VOL,
        });

        let ti = t;

        for (let i = 0; i < ROBOT_SPARKS; i++) {
          const f = rand(ROBOT_SPARK_MIN_F, ROBOT_SPARK_MAX_F);

          this.tone(out, ti, {
            type: "square",
            f,
            f2: f * ROBOT_SPARK_SLIDE,
            dur: rand(ROBOT_SPARK_MIN_DUR, ROBOT_SPARK_MAX_DUR),
            vol: ROBOT_SPARK_VOL,
            lp: ROBOT_SPARK_LP,
          });
          this.noise(out, ti, {
            filter: "bandpass",
            f: f * ROBOT_ZAP_RATIO,
            q: ROBOT_ZAP_Q,
            dur: ROBOT_ZAP_DUR,
            vol: ROBOT_ZAP_VOL,
          });
          ti += rand(ROBOT_SPARK_MIN_GAP, ROBOT_SPARK_MAX_GAP);
        }

        this.tone(out, t + ROBOT_RUMBLE_DELAY, {
          type: "triangle",
          f: ROBOT_RUMBLE_F,
          f2: ROBOT_RUMBLE_F2,
          dur: ROBOT_RUMBLE_DUR,
          vol: ROBOT_RUMBLE_VOL,
        });
        break;
      }

      case "bounce": {
        const ctx = this.audioContext;
        const o = ctx.createOscillator();

        o.type = "sine";
        o.frequency.setValueAtTime(BOUNCE_F, t);
        o.frequency.exponentialRampToValueAtTime(
          BOUNCE_F_END,
          t + BOUNCE_SWEEP,
        );

        const lfo = ctx.createOscillator();

        lfo.frequency.value = 17;

        const depth = ctx.createGain();

        depth.gain.setValueAtTime(BOUNCE_WOBBLE_DEPTH, t);
        depth.gain.exponentialRampToValueAtTime(
          BOUNCE_WOBBLE_END,
          t + BOUNCE_SWEEP,
        );
        lfo.connect(depth).connect(o.frequency);

        const g = ctx.createGain();

        g.gain.setValueAtTime(SILENCE, t);
        g.gain.exponentialRampToValueAtTime(BOUNCE_PEAK, t + BOUNCE_ATTACK);
        g.gain.exponentialRampToValueAtTime(SILENCE, t + BOUNCE_DECAY);
        o.connect(g).connect(out);
        o.start(t);
        lfo.start(t);
        o.stop(t + BOUNCE_STOP);
        lfo.stop(t + BOUNCE_STOP);
        cleanup(o, [o, lfo, depth, g]);
        this.tone(out, t, {
          type: "triangle",
          f: BOUNCE_CLICK_F,
          dur: BOUNCE_CLICK_DUR,
          vol: BOUNCE_CLICK_VOL,
        });
        break;
      }
    }
  }
}
