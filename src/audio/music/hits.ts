import type { Note } from "#root/src/audio/music/deck.ts";
import { midiToFreq } from "#root/src/audio/tracks.ts";
import {
  STOP_PADDING,
  SILENCE,
  cleanup,
  noiseVoice,
  rand,
} from "#root/src/audio/voice-kit.ts";

/** The bass: how long a note is held (between a floor and a ceiling), its peak, and how it settles. */
const BASS_MIN_LEN = 0.08;
const BASS_HOLD = 0.85;
const BASS_MAX_LEN = 1.6;
const BASS_LEVEL = 0.24;
const BASS_ATTACK = 0.006;
const BASS_SUSTAIN = 0.6;
const BASS_SUSTAIN_TIME = 0.15;
const BASS_RELEASE = 0.04;
const BASS_CUTOFF = 700;
const BASS_TAIL = 0.25;
/** The arpeggio pluck: how fast it speaks, how long it decays and when its oscillator stops. */
const PLUCK_ATTACK = 0.004;
const PLUCK_DECAY = 0.24;
const PLUCK_STOP = 0.26;
/** The bell: a second partial a bit over three times the pitch (not an exact harmonic), loud at first and fading fast. */
const BELL_PARTIAL = 3.01;
const BELL_PARTIAL_LEVEL = 0.25;
const BELL_PARTIAL_FLOOR = 0.01;
const BELL_PARTIAL_FALL = 0.15;
const BELL_ATTACK = 0.004;
/** The percussion: a hat (t), an accented hat (T) and a snare (s), each with its filter, level and length; the noise start wanders. */
const PERC_SNARE_CUTOFF = 8500;
const PERC_CUTOFF = 7000;
const PERC_SNARE_Q = 1.2;
const PERC_Q = 0.7;
const PERC_ACCENT_LEVEL = 0.07;
const PERC_SNARE_LEVEL = 0.04;
const PERC_LEVEL = 0.04;
const PERC_SNARE_DUR = 0.09;
const PERC_DUR = 0.035;
const PERC_SNARE_ATTACK = 0.03;
const PERC_ATTACK = 0.002;
const PERC_PAN = 0.35;
const PERC_NOISE_START = 1.8;

export function bassNote(note: Note, midi: number, len: number): void {
  const { deck, t, level } = note;
  const { ctx } = deck;
  const f = midiToFreq(midi);
  const dur = Math.max(BASS_MIN_LEN, Math.min(len * BASS_HOLD, BASS_MAX_LEN));
  const g = ctx.createGain();
  const peak = BASS_LEVEL * level;

  g.gain.setValueAtTime(SILENCE, t);
  g.gain.exponentialRampToValueAtTime(peak, t + BASS_ATTACK);
  g.gain.exponentialRampToValueAtTime(
    peak * BASS_SUSTAIN,
    t + BASS_SUSTAIN_TIME,
  );
  g.gain.setValueAtTime(peak * BASS_SUSTAIN, t + dur);
  g.gain.setTargetAtTime(SILENCE, t + dur, BASS_RELEASE);

  const lp = ctx.createBiquadFilter();

  lp.type = "lowpass";
  lp.frequency.value = BASS_CUTOFF;

  const o1 = ctx.createOscillator();

  o1.type = "triangle";
  o1.frequency.value = f;

  const o2 = ctx.createOscillator();

  o2.type = "sine";
  o2.frequency.value = f;
  o1.connect(lp);
  o2.connect(lp);
  lp.connect(g).connect(deck.out);

  const end = t + dur + BASS_TAIL;

  o1.start(t);
  o2.start(t);
  o1.stop(end);
  o2.stop(end);
  cleanup(o1, [o1, o2, lp, g]);
}

export function pluck(note: Note, midi: number, pan: number): void {
  const { deck, t, level: vol } = note;
  const { ctx } = deck;
  const o = ctx.createOscillator();

  o.type = "triangle";
  o.frequency.value = midiToFreq(midi);

  const g = ctx.createGain();

  g.gain.setValueAtTime(SILENCE, t);
  g.gain.exponentialRampToValueAtTime(vol, t + PLUCK_ATTACK);
  g.gain.exponentialRampToValueAtTime(SILENCE, t + PLUCK_DECAY);

  const p = ctx.createStereoPanner();

  p.pan.value = pan;
  o.connect(g).connect(p).connect(deck.out);
  g.connect(deck.delayIn);
  o.start(t);
  o.stop(t + PLUCK_STOP);
  cleanup(o, [o, g, p]);
}

export function bell(
  note: Note,
  midi: number,
  pan: number,
  decay: number,
): void {
  const { deck, t, level: vol } = note;
  const { ctx } = deck;
  const f = midiToFreq(midi);
  const o = ctx.createOscillator();

  o.type = "sine";
  o.frequency.value = f;

  const o2 = ctx.createOscillator();

  o2.type = "sine";
  o2.frequency.value = f * BELL_PARTIAL;

  const g2 = ctx.createGain();

  g2.gain.setValueAtTime(BELL_PARTIAL_LEVEL, t);
  g2.gain.exponentialRampToValueAtTime(
    BELL_PARTIAL_FLOOR,
    t + BELL_PARTIAL_FALL,
  );

  const g = ctx.createGain();

  g.gain.setValueAtTime(SILENCE, t);
  g.gain.exponentialRampToValueAtTime(vol, t + BELL_ATTACK);
  g.gain.exponentialRampToValueAtTime(SILENCE, t + decay);

  const p = ctx.createStereoPanner();

  p.pan.value = pan;
  o.connect(g);
  o2.connect(g2).connect(g);
  g.connect(p).connect(deck.out);
  g.connect(deck.delayIn);
  o.start(t);
  o2.start(t);
  o.stop(t + decay + STOP_PADDING);
  o2.stop(t + decay + STOP_PADDING);
  cleanup(o, [o, o2, g2, g, p]);
}

/** What each percussion hit is: its filter, level and length. */
interface Hit {
  filter: BiquadFilterType;
  cutoff: number;
  q: number;
  level: number;
  dur: number;
  attack: number;
}

const HAT: Hit = {
  filter: "highpass",
  cutoff: PERC_CUTOFF,
  q: PERC_Q,
  level: PERC_LEVEL,
  dur: PERC_DUR,
  attack: PERC_ATTACK,
};
const HITS: Record<"t" | "T" | "s", Hit> = {
  t: HAT,
  T: { ...HAT, level: PERC_ACCENT_LEVEL },
  s: {
    filter: "bandpass",
    cutoff: PERC_SNARE_CUTOFF,
    q: PERC_SNARE_Q,
    level: PERC_SNARE_LEVEL,
    dur: PERC_SNARE_DUR,
    attack: PERC_SNARE_ATTACK,
  },
};

export function perc(note: Note, kind: "t" | "T" | "s"): void {
  const { deck, t } = note;
  const { ctx } = deck;

  if (!deck.noise) {
    return;
  }

  const hit = HITS[kind];
  const { src, f } = noiseVoice(ctx, deck.noise, hit.filter);

  f.frequency.value = hit.cutoff;
  f.Q.value = hit.q;

  const g = ctx.createGain();

  g.gain.setValueAtTime(SILENCE, t);
  g.gain.exponentialRampToValueAtTime(hit.level * note.level, t + hit.attack);
  g.gain.exponentialRampToValueAtTime(SILENCE, t + hit.dur);

  const p = ctx.createStereoPanner();

  p.pan.value = rand(-PERC_PAN, PERC_PAN);
  src.connect(f).connect(g).connect(p).connect(deck.out);
  src.start(t, rand(0, PERC_NOISE_START));
  src.stop(t + hit.dur + STOP_PADDING);
  cleanup(src, [src, f, g, p]);
}
