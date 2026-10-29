/**
 * Spaghetti Rig soundtrack — pure composition data + a compiler that turns it
 * into per-step events. No Web Audio here, so it can be unit tested in Node.
 *
 * Notation
 *  - Notes: scientific pitch names, e.g. "C4" (MIDI 60), "F#5", "Bb3".
 *  - Melody: one string per bar, tokens "NOTE/len" or "r/len" (len in 16ths).
 *  - Harmony: one entry per chord, "BASS: V1 V2 V3" with optional "*beats"
 *    suffix (defaults to a whole bar). Voicings are hand voice-led.
 *  - Patterns (one bar, one char per 16th, repeated every bar):
 *      bass  'R' root, '5' fifth above, 'O' octave above, '.' hold/rest
 *      arp   '0'..'9' index into the pad voicing (wraps up an octave), '.' rest
 *      comp  'x' short chord stab, '.' rest
 *      perc  't' soft tick, 'T' accented tick, 's' shaker, '.' rest
 */

import { nth } from "#root/src/nth.ts";

import rawTracks from "#root/src/audio/tracks.json";
import { parseTrackDefs } from "#root/src/audio/load/load.ts";
import {
  parseChord,
  parseMelodyBar,
  SEMITONES_PER_OCTAVE,
  type Chord,
} from "#root/src/audio/music/notation.ts";
import type { MusicTheme, Theme, TrackDef } from "#root/src/audio/types.ts";

export type {
  LeadVoice,
  MusicTheme,
  Theme,
  TrackDef,
} from "#root/src/audio/types.ts";

// ---------------------------------------------------------------------------
// The score lives in tracks.json; the loader fills in what a track leaves out
// ---------------------------------------------------------------------------

export const TRACK_DEFS: TrackDef[] = parseTrackDefs(rawTracks);

// ---------------------------------------------------------------------------
// Parsing / compiling
// ---------------------------------------------------------------------------

const FIFTH_SEMITONES = 7;

export const STEPS_PER_BEAT = 4;

const SECONDS_PER_MINUTE = 60;

interface NoteEvent {
  midi: number;
  len: number;
}
interface StepEvents {
  lead?: NoteEvent;
  bass?: NoteEvent;
  arp?: number;
  /** A new chord starts on this step (pad sustain length in steps). */
  chord?: { pad: number[]; bass: number; len: number };
  comp?: number[];
  perc?: "t" | "T" | "s";
}

export interface CompiledTrack {
  def: TrackDef;
  stepsPerBar: number;
  bars: number;
  totalSteps: number;
  /** Seconds per 16th step. */
  stepSec: number;
  /** Loop length in seconds. */
  loopSec: number;
  steps: StepEvents[];
}

/** The steps of one track, looked up modulo its length (so a note may ring over the loop point). */
type At = (i: number) => StepEvents;

/** Lay the chords out over the steps: each chord's first step carries it, and every step it covers knows it. */
function compileHarmony(
  def: TrackDef,
  at: At,
  totalSteps: number,
): (Chord | undefined)[] {
  const chordAt: (Chord | undefined)[] = Array.from<Chord | undefined>({
    length: totalSteps,
  });
  let pos = 0;

  for (const entry of def.harmony) {
    const c = parseChord(entry, def.beatsPerBar);
    const len = c.beats * STEPS_PER_BEAT;

    if (pos < totalSteps) {
      at(pos).chord = { pad: c.pad, bass: c.bass, len };
    }

    for (let i = 0; i < len && pos + i < totalSteps; i++) {
      chordAt[pos + i] = c;
    }

    pos += len;
  }

  return chordAt;
}

/** Put each bar's melody notes on the steps they start on. */
function compileMelody(
  def: TrackDef,
  at: At,
  stepsPerBar: number,
  totalSteps: number,
) {
  for (const [b, bar] of def.melody.entries()) {
    let s = b * stepsPerBar;

    for (const tok of parseMelodyBar(bar)) {
      if (tok.midi !== null && s < totalSteps) {
        at(s).lead = { midi: tok.midi, len: tok.len };
      }

      s += tok.len;
    }
  }
}

/** One step of the bass pattern: a root, fifth or octave note held until the next mark. */
function bassNote(
  def: TrackDef,
  i: number,
  chord: Chord,
): NoteEvent | undefined {
  const bc = def.bass[i];

  if (!bc || bc === ".") {
    return undefined;
  }

  const stepsPerBar = def.beatsPerBar * STEPS_PER_BEAT;
  let next = i + 1;

  while (next < stepsPerBar && def.bass[next] === ".") {
    next++;
  }

  const off =
    bc === "5" ? FIFTH_SEMITONES : bc === "O" ? SEMITONES_PER_OCTAVE : 0;

  return { midi: chord.bass + off, len: next - i };
}

/** One step of the arpeggio pattern: a pad voice an octave up, wrapping up another octave past the voicing. */
function arpNote(def: TrackDef, i: number, chord: Chord): number | undefined {
  const ac = def.arp[i];

  if (!ac || ac === ".") {
    return undefined;
  }

  const idx = Number(ac);
  const n = chord.pad.length;
  const note = chord.pad[idx % n];

  return note === undefined
    ? undefined
    : note + SEMITONES_PER_OCTAVE + SEMITONES_PER_OCTAVE * Math.floor(idx / n);
}

const PERC_MARKS = new Set(["t", "T", "s"]);
const isPerc = (c: string | undefined): c is "t" | "T" | "s" =>
  c !== undefined && PERC_MARKS.has(c);

/** Play the one-bar bass, arp, comp and perc patterns on one step under its chord. */
function compilePatternStep(
  def: TrackDef,
  i: number,
  chord: Chord,
  ev: StepEvents,
) {
  const bass = bassNote(def, i, chord);

  if (bass) {
    ev.bass = bass;
  }

  const arp = arpNote(def, i, chord);

  if (arp !== undefined) {
    ev.arp = arp;
  }

  if (def.comp?.[i] === "x") {
    ev.comp = chord.pad;
  }

  const pc = def.perc?.[i];

  if (isPerc(pc)) {
    ev.perc = pc;
  }
}

function compileTrack(def: TrackDef): CompiledTrack {
  const stepsPerBar = def.beatsPerBar * STEPS_PER_BEAT;
  const bars = def.melody.length;
  const totalSteps = bars * stepsPerBar;
  const steps: StepEvents[] = Array.from({ length: totalSteps }, () => ({}));
  const at: At = (i) =>
    nth(steps, ((i % totalSteps) + totalSteps) % totalSteps, "steps");
  const chordAt = compileHarmony(def, at, totalSteps);

  compileMelody(def, at, stepsPerBar, totalSteps);
  for (let step = 0; step < bars * stepsPerBar; step++) {
    const chord = chordAt[step];

    if (chord) {
      compilePatternStep(def, step % stepsPerBar, chord, at(step));
    }
  }

  const stepSec = SECONDS_PER_MINUTE / def.bpm / STEPS_PER_BEAT;

  return {
    def,
    stepsPerBar,
    bars,
    totalSteps,
    stepSec,
    loopSec: stepSec * totalSteps,
    steps,
  };
}

export const COMPILED_TRACKS: CompiledTrack[] = TRACK_DEFS.map((def) =>
  compileTrack(def),
);

export const MUSIC_THEMES: MusicTheme[] = [
  "title",
  "walk",
  "stop",
  "boss",
  "victory",
  "defeat",
];

export function tracksForTheme(theme: Theme): CompiledTrack[] {
  return COMPILED_TRACKS.filter((t) => t.def.theme === theme);
}

export const TRACKS: { name: string; theme: Theme; bpm: number }[] =
  TRACK_DEFS.map(({ name, theme, bpm }) => ({ name, theme, bpm }));
