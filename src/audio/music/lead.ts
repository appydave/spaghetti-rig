import type { Note } from "#root/src/audio/music/deck.ts";
import { present } from "#root/src/nth.ts";
import { type LeadVoice } from "#root/src/audio/tracks.ts";
import { midiToFreq } from "#root/src/audio/music/notation.ts";
import { SILENCE, cleanup } from "#root/src/audio/voice-kit.ts";

/** The lead voice: its peak, how fast it speaks, how long a note holds and rings, and how it settles. */
const LEAD_LEVEL = 0.16;
const LEAD_ATTACK = 0.008;
const LEAD_SAW_ATTACK = 0.012;
const LEAD_MIN_LEN = 0.08;
const LEAD_HOLD = 0.92;
const LEAD_PLUCK_MAX_LEN = 0.3;
const LEAD_TAIL = 0.2;
const LEAD_PLUCK_TAIL = 0.25;
const LEAD_PLUCK_FALL = 0.2;
const LEAD_SUSTAIN = 0.7;
const LEAD_SUSTAIN_TIME = 0.12;
const LEAD_RELEASE = 0.05;
/** The lead's filter opens to a multiple of the note's pitch (never past a ceiling) and closes to another over a sweep. */
const LEAD_Q = 0.8;
const LEAD_PLUCK_Q = 2;
const LEAD_SAW_OPEN = 6;
const LEAD_PLUCK_OPEN = 8;
const LEAD_OPEN = 5;
const LEAD_OPEN_MAX = 9000;
const LEAD_PLUCK_CLOSE = 1.5;
const LEAD_CLOSE = 2.5;
const LEAD_CLOSE_MAX = 6000;
const LEAD_PLUCK_SWEEP = 0.25;
const LEAD_SWEEP = 0.4;
/** Each lead voice is a main oscillator and a second one beside it: its level and, in cents, how far it is detuned. */
const LEAD_TRIANGLE_OCTAVE = 0.12;
const LEAD_SINE_CHORUS = 0.3;
const LEAD_SINE_CHORUS_DETUNE = 7;
const LEAD_SQUARE_LEVEL = 0.55;
const LEAD_SQUARE_SUB = 0.6;
const LEAD_SQUARE_SUB_DETUNE = 6;
const LEAD_SAW_LEVEL = 0.5;
const LEAD_SAW_DETUNE = 8;
const LEAD_BUZZ = 0.25;
/** A long lead note gets a vibrato: its rate, the shortest note that has one, and when it starts and is fully in. */
const LEAD_VIBRATO_RATE = 5.4;
const LEAD_VIBRATO_MIN_LEN = 0.32;
const LEAD_VIBRATO_DELAY = 0.18;
const LEAD_VIBRATO_FULL = 0.45;
const LEAD_VIBRATO_DEPTH = 0.006;

/** What a lead note is built from: the context, its output gain, and the nodes and oscillators to start and free. */
interface Patch {
  ctx: AudioContext;
  g: GainNode;
  nodes: AudioNode[];
  srcs: OscillatorNode[];
}

/** One oscillator of a voice: its wave, how far above the pitch it sits, how loud it is and how far it is detuned. */
interface Part {
  type: OscillatorType;
  ratio: number;
  level: number;
  detune: number;
}

/** The filter a voice plays through, if it has one: its Q, how far above the pitch it opens and closes, and how long the sweep takes. */
interface Sweep {
  q: number;
  open: number;
  close: number;
  time: number;
}

const UNISON = 1;
const OCTAVE_UP = 2;

/** The oscillators of each voice; the first is the one whose end frees the note. */
const PARTS: Record<LeadVoice, Part[]> = {
  triangle: [
    { type: "triangle", ratio: UNISON, level: 1, detune: 0 },
    { type: "sine", ratio: OCTAVE_UP, level: LEAD_TRIANGLE_OCTAVE, detune: 0 },
  ],
  sine: [
    { type: "sine", ratio: UNISON, level: 1, detune: 0 },
    {
      type: "triangle",
      ratio: UNISON,
      level: LEAD_SINE_CHORUS,
      detune: LEAD_SINE_CHORUS_DETUNE,
    },
  ],
  square: [
    { type: "square", ratio: UNISON, level: LEAD_SQUARE_LEVEL, detune: 0 },
    {
      type: "triangle",
      ratio: UNISON,
      level: LEAD_SQUARE_SUB,
      detune: -LEAD_SQUARE_SUB_DETUNE,
    },
  ],
  saw: [
    {
      type: "sawtooth",
      ratio: UNISON,
      level: LEAD_SAW_LEVEL,
      detune: -LEAD_SAW_DETUNE,
    },
    {
      type: "sawtooth",
      ratio: UNISON,
      level: LEAD_SAW_LEVEL,
      detune: LEAD_SAW_DETUNE,
    },
  ],
  pluck: [
    { type: "triangle", ratio: UNISON, level: 1, detune: 0 },
    { type: "square", ratio: UNISON, level: LEAD_BUZZ, detune: 0 },
  ],
};

/** The voices that play through a sweeping low-pass; the others go straight to the gain. */
const SWEEPS: Partial<Record<LeadVoice, Sweep>> = {
  square: {
    q: LEAD_Q,
    open: LEAD_OPEN,
    close: LEAD_CLOSE,
    time: LEAD_SWEEP,
  },
  saw: {
    q: LEAD_Q,
    open: LEAD_SAW_OPEN,
    close: LEAD_CLOSE,
    time: LEAD_SWEEP,
  },
  pluck: {
    q: LEAD_PLUCK_Q,
    open: LEAD_PLUCK_OPEN,
    close: LEAD_PLUCK_CLOSE,
    time: LEAD_PLUCK_SWEEP,
  },
};

/** How long the note is held before it releases (a pluck is short whatever the score says). */
function holdFor(voice: LeadVoice, len: number): number {
  return voice === "pluck"
    ? Math.min(len, LEAD_PLUCK_MAX_LEN)
    : Math.max(LEAD_MIN_LEN, len * LEAD_HOLD);
}

/** A held note rises, sags to its sustain, holds, then releases. */
function sustainEnvelope(g: GainNode, t: number, dur: number, peak: number) {
  g.gain.exponentialRampToValueAtTime(
    peak * LEAD_SUSTAIN,
    t + LEAD_SUSTAIN_TIME,
  );
  g.gain.setValueAtTime(peak * LEAD_SUSTAIN, t + dur);
  g.gain.setTargetAtTime(SILENCE, t + dur, LEAD_RELEASE);
}

function envelope(g: GainNode, note: Note, voice: LeadVoice, dur: number) {
  const { t } = note;
  const peak = LEAD_LEVEL * note.level;

  g.gain.setValueAtTime(SILENCE, t);
  g.gain.exponentialRampToValueAtTime(
    peak,
    t + (voice === "saw" ? LEAD_SAW_ATTACK : LEAD_ATTACK),
  );
  if (voice === "pluck") {
    g.gain.exponentialRampToValueAtTime(SILENCE, t + dur + LEAD_PLUCK_FALL);
  } else {
    sustainEnvelope(g, t, dur, peak);
  }
}

/** The low-pass a voice sweeps: open at a multiple of the pitch (never past a ceiling), closing over the sweep. */
function addSweep(patch: Patch, t: number, sweep: Sweep, f: number) {
  const lp = patch.ctx.createBiquadFilter();

  lp.type = "lowpass";
  lp.Q.value = sweep.q;
  lp.frequency.setValueAtTime(Math.min(f * sweep.open, LEAD_OPEN_MAX), t);
  lp.frequency.exponentialRampToValueAtTime(
    Math.min(f * sweep.close, LEAD_CLOSE_MAX),
    t + sweep.time,
  );
  lp.connect(patch.g);
  patch.nodes.push(lp);

  return lp;
}

/** One oscillator of the voice, straight into the target or through its own level. */
function addPart(patch: Patch, target: AudioNode, part: Part, f: number) {
  const o = patch.ctx.createOscillator();

  o.type = part.type;
  o.frequency.value = f * part.ratio;
  o.detune.value = part.detune;
  if (part.level === 1) {
    o.connect(target);
  } else {
    const og = patch.ctx.createGain();

    og.gain.value = part.level;
    o.connect(og).connect(target);
    patch.nodes.push(og);
  }

  patch.srcs.push(o);
  patch.nodes.push(o);

  return o;
}

/** A slow wobble that fades in after a delay and bends every oscillator's pitch. */
function addVibrato(patch: Patch, t: number, f: number) {
  const lfo = patch.ctx.createOscillator();

  lfo.frequency.value = LEAD_VIBRATO_RATE;

  const depth = patch.ctx.createGain();

  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(0, t + LEAD_VIBRATO_DELAY);
  depth.gain.linearRampToValueAtTime(
    f * LEAD_VIBRATO_DEPTH,
    t + LEAD_VIBRATO_FULL,
  );
  lfo.connect(depth);
  for (const s of patch.srcs) {
    depth.connect(s.frequency);
  }

  patch.srcs.push(lfo);
  patch.nodes.push(lfo, depth);
}

export function leadNote(
  note: Note,
  midi: number,
  len: number,
  voice: LeadVoice,
): void {
  const { deck, t } = note;
  const { ctx } = deck;
  const f = midiToFreq(midi);
  const pluck = voice === "pluck";
  const dur = holdFor(voice, len);
  const end = t + dur + (pluck ? LEAD_PLUCK_TAIL : LEAD_TAIL);
  const g = ctx.createGain();

  envelope(g, note, voice, dur);

  const patch: Patch = { ctx, g, nodes: [g], srcs: [] };
  const sweep = SWEEPS[voice];
  const target = sweep ? addSweep(patch, t, sweep, f) : g;

  for (const part of PARTS[voice]) {
    addPart(patch, target, part, f);
  }

  if (!pluck && dur > LEAD_VIBRATO_MIN_LEN) {
    addVibrato(patch, t, f);
  }

  g.connect(deck.out);
  g.connect(deck.delayIn);
  for (const s of patch.srcs) {
    s.start(t);
    s.stop(end);
  }

  cleanup(present(patch.srcs[0], "the lead's first oscillator"), patch.nodes);
}
