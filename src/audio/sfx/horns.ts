import { midiToFreq } from "#root/src/audio/music/notation.ts";
import type {
  HornNote,
  SfxKit,
  SlideNote,
} from "#root/src/audio/sfx/voices.ts";
import { SILENCE, STOP_PADDING, cleanup } from "#root/src/audio/voice-kit.ts";

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

/** Brass-like synth note: detuned saws through an opening filter. */
export function brass(
  kit: SfxKit,
  dest: AudioNode,
  t: number,
  h: HornNote,
): void {
  const { midi, dur, vol } = h;
  const { ctx } = kit;
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
export function trombone(
  kit: SfxKit,
  dest: AudioNode,
  t: number,
  h: SlideNote,
): void {
  const { midi, dur, wobble } = h;
  const { ctx } = kit;
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
