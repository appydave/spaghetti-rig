import type { Note } from "#root/src/audio/music/deck.ts";
import {
  SEMITONES_PER_OCTAVE,
  midiToFreq,
} from "#root/src/audio/music/notation.ts";
import { SILENCE, cleanup } from "#root/src/audio/voice-kit.ts";
import { rand } from "#root/src/maths.ts";

/** The pad chord: the tail it rings for, the filter's Q, how far apart the two sides sit, and each note's level. */
const PAD_TAIL = 0.9;
const PAD_Q = 0.5;
const PAD_SPREAD = 0.6;
const PAD_GLASS_LEVEL = 0.05;
const PAD_LEVEL = 0.04;
const PAD_RELEASE = 0.22;
/** A glass pad opens at once and settles to a fraction of its level; the others sweep their filter up and back. */
const PAD_GLASS_CUTOFF = 3200;
const PAD_GLASS_RISE = 0.02;
const PAD_GLASS_SETTLE_TIME = 0.9;
const PAD_GLASS_SETTLE = 0.45;
const PAD_DARK_START = 450;
const PAD_START = 700;
const PAD_DARK_PEAK = 800;
const PAD_PEAK = 1500;
const PAD_PEAK_AT = 0.5;
const PAD_PEAK_MAX = 1.2;
const PAD_DARK_END = 600;
const PAD_END = 1000;
const PAD_RISE = 0.25;
/** The pad's oscillators are detuned in cents by side, plus a small random wander. */
const PAD_GLASS_DETUNE = 5;
const PAD_DETUNE = 9;
const PAD_WANDER = 2;
/** The comp stab: its level, how fast it speaks and dies, where its filter sits, and when it stops. */
const COMP_LEVEL = 0.06;
const COMP_ATTACK = 0.005;
const COMP_DECAY = 0.16;
const COMP_DARK_CUTOFF = 1400;
const COMP_CUTOFF = 2600;
const COMP_STOP = 0.18;

/** What a pad chord is: its notes, how long it holds and which pad the track asks for. */
interface Chord {
  notes: number[];
  len: number;
  kind: Note["deck"]["track"]["def"]["pad"];
}

/** One side of the stereo pair: its filter and gain, how loud it is, how far its oscillators are detuned, and the nodes to free. */
interface Side {
  lp: BiquadFilterNode;
  g: GainNode;
  vol: number;
  detune: number;
  nodes: AudioNode[];
}

const SIDES = [-1, 1];

/** The glass pad opens at once, then settles to a lower level. */
function glassShape(side: Side, t: number) {
  const { lp, g, vol } = side;

  lp.frequency.value = PAD_GLASS_CUTOFF;
  g.gain.setValueAtTime(SILENCE, t);
  g.gain.exponentialRampToValueAtTime(vol, t + PAD_GLASS_RISE);
  g.gain.exponentialRampToValueAtTime(
    vol * PAD_GLASS_SETTLE,
    t + PAD_GLASS_SETTLE_TIME,
  );
}

/** The other pads open their filter over the chord and fade in. */
function warmShape(side: Side, t: number, chord: Chord) {
  const { lp, g, vol } = side;
  const dark = chord.kind === "dark";

  lp.frequency.setValueAtTime(dark ? PAD_DARK_START : PAD_START, t);
  lp.frequency.linearRampToValueAtTime(
    dark ? PAD_DARK_PEAK : PAD_PEAK,
    t + Math.min(chord.len * PAD_PEAK_AT, PAD_PEAK_MAX),
  );
  lp.frequency.linearRampToValueAtTime(
    dark ? PAD_DARK_END : PAD_END,
    t + chord.len,
  );
  g.gain.setValueAtTime(SILENCE, t);
  g.gain.linearRampToValueAtTime(vol, t + PAD_RISE);
}

/** One side's filter, gain and pan, shaped for the pad and wired to the deck. */
function wireSide(note: Note, chord: Chord, pan: number, nodes: AudioNode[]) {
  const { deck, t } = note;
  const { ctx } = deck;
  const glass = chord.kind === "glass";
  const lp = ctx.createBiquadFilter();

  lp.type = "lowpass";
  lp.Q.value = PAD_Q;

  const g = ctx.createGain();
  const panner = ctx.createStereoPanner();

  panner.pan.value = pan * PAD_SPREAD;

  const per = (glass ? PAD_GLASS_LEVEL : PAD_LEVEL) * note.level;
  const side: Side = {
    lp,
    g,
    vol: per * chord.notes.length,
    detune: pan * (glass ? PAD_GLASS_DETUNE : PAD_DETUNE),
    nodes,
  };

  if (glass) {
    glassShape(side, t);
  } else {
    warmShape(side, t, chord);
  }

  g.gain.setValueAtTime(
    glass ? side.vol * PAD_GLASS_SETTLE : side.vol,
    t + chord.len,
  );
  g.gain.setTargetAtTime(SILENCE, t + chord.len, PAD_RELEASE);
  lp.connect(g).connect(panner).connect(deck.out);
  nodes.push(lp, g, panner);

  return side;
}

/** One note of the chord on one side. */
function addOscillator(note: Note, chord: Chord, side: Side, midi: number) {
  const { t } = note;
  const o = note.deck.ctx.createOscillator();

  o.type = chord.kind === "glass" ? "triangle" : "sawtooth";
  o.frequency.value = midiToFreq(midi);
  o.detune.value = side.detune + rand(-PAD_WANDER, PAD_WANDER);

  const og = note.deck.ctx.createGain();

  og.gain.value = 1 / chord.notes.length;
  o.connect(og).connect(side.lp);
  side.nodes.push(o, og);
  o.start(t);
  o.stop(t + chord.len + PAD_TAIL);

  return o;
}

export function padChord(note: Note, notes: number[], len: number): void {
  const chord: Chord = { notes, len, kind: note.deck.track.def.pad };
  const nodes: AudioNode[] = [];
  const oscillators = SIDES.flatMap((pan) => {
    const side = wireSide(note, chord, pan, nodes);

    return notes.map((midi) => addOscillator(note, chord, side, midi));
  });
  const [first] = oscillators;

  if (first) {
    cleanup(first, nodes);
  }
}

export function compStab(note: Note, notes: number[], dark: boolean): void {
  const { deck, t, level } = note;
  const { ctx } = deck;
  const g = ctx.createGain();
  const vol = COMP_LEVEL * level;

  g.gain.setValueAtTime(SILENCE, t);
  g.gain.exponentialRampToValueAtTime(vol, t + COMP_ATTACK);
  g.gain.exponentialRampToValueAtTime(SILENCE, t + COMP_DECAY);

  const lp = ctx.createBiquadFilter();

  lp.type = "lowpass";
  lp.frequency.value = dark ? COMP_DARK_CUTOFF : COMP_CUTOFF;
  lp.connect(g).connect(deck.out);

  const nodes: AudioNode[] = [g, lp];
  let first: OscillatorNode | null = null;

  for (const n of notes) {
    const o = ctx.createOscillator();

    o.type = dark ? "square" : "triangle";
    o.frequency.value = midiToFreq(n + (dark ? 0 : SEMITONES_PER_OCTAVE));

    const og = ctx.createGain();

    og.gain.value = 1 / notes.length;
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(t + COMP_STOP);
    nodes.push(o, og);
    first ??= o;
  }

  if (first) {
    cleanup(first, nodes);
  }
}
