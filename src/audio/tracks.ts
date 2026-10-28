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
import type { MusicTheme, Theme, TrackDef } from "#root/src/audio/types.ts";

export type {
  ArpVoice,
  LeadVoice,
  MusicTheme,
  PadVoice,
  Theme,
  TrackDef,
  TrackMix,
} from "#root/src/audio/types.ts";

// ---------------------------------------------------------------------------
// The score lives in tracks.json; the loader fills in what a track leaves out
// ---------------------------------------------------------------------------

export const TRACK_DEFS: TrackDef[] = parseTrackDefs(rawTracks);

// ---------------------------------------------------------------------------
// Parsing / compiling
// ---------------------------------------------------------------------------

/** One octave of piano keys, a dot where a black key sits: a letter's index is its semitone above C. */
const NATURAL_KEYS = "C.D.EF.G.A.B";

export const SEMITONES_PER_OCTAVE = 12;

const FIFTH_SEMITONES = 7;
const A4_MIDI = 69;
const A4_HZ = 440;

export const STEPS_PER_BEAT = 4;

const SECONDS_PER_MINUTE = 60;

/** "C4" -> 60, "F#5" -> 78, "Bb1" -> 34. Throws on bad input. */
export function parseNote(name: string): number {
  const m = /^(?<letter>[A-G])(?<accidental>#|b)?(?<octave>-?\d)$/.exec(
    name.trim(),
  );

  if (!m) {
    throw new Error(`Bad note "${name}"`);
  }

  const { letter = "", accidental, octave = "" } = m.groups ?? {};
  const pc = NATURAL_KEYS.indexOf(letter);

  if (pc < 0) {
    throw new Error(`Bad note "${name}"`);
  }

  const acc = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;

  return (Number(octave) + 1) * SEMITONES_PER_OCTAVE + pc + acc;
}

export function midiToFreq(midi: number): number {
  return A4_HZ * Math.pow(2, (midi - A4_MIDI) / SEMITONES_PER_OCTAVE);
}

export interface MelodyToken {
  midi: number | null;
  len: number;
}

export function parseMelodyBar(bar: string): MelodyToken[] {
  return bar
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => {
      const [note, lenStr] = tok.split("/");
      const len = Number(lenStr);

      if (!note || !Number.isInteger(len) || len <= 0) {
        throw new Error(`Bad melody token "${tok}"`);
      }

      return { midi: note === "r" ? null : parseNote(note), len };
    });
}

export interface Chord {
  bass: number;
  pad: number[];
  beats: number;
}

export function parseChord(entry: string, beatsPerBar: number): Chord {
  const [bassStr, rest] = entry.split(":");

  if (!bassStr || rest === undefined) {
    throw new Error(`Bad chord "${entry}"`);
  }

  let beats = beatsPerBar;
  const tokens = rest
    .trim()
    .split(/\s+/)
    .filter((t) => {
      if (t.startsWith("*")) {
        beats = Number(t.slice(1));

        return false;
      }

      return true;
    });

  return {
    bass: parseNote(bassStr),
    pad: tokens.map((token) => parseNote(token)),
    beats,
  };
}

export interface NoteEvent {
  midi: number;
  len: number;
}
export interface StepEvents {
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

export function trackBars(def: TrackDef): number {
  return def.melody.length;
}

export function compileTrack(def: TrackDef): CompiledTrack {
  const stepsPerBar = def.beatsPerBar * STEPS_PER_BEAT;
  const bars = def.melody.length;
  const totalSteps = bars * stepsPerBar;
  const steps: StepEvents[] = Array.from({ length: totalSteps }, () => ({}));
  const at = (i: number): StepEvents =>
    nth(steps, ((i % totalSteps) + totalSteps) % totalSteps, "steps");

  // Harmony
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

  // Melody
  for (const [b, bar] of def.melody.entries()) {
    let s = b * stepsPerBar;

    for (const tok of parseMelodyBar(bar)) {
      if (tok.midi !== null && s < totalSteps) {
        at(s).lead = { midi: tok.midi, len: tok.len };
      }

      s += tok.len;
    }
  }

  // Per-bar patterns
  for (let b = 0; b < bars; b++) {
    const base = b * stepsPerBar;

    for (let i = 0; i < stepsPerBar; i++) {
      const step = base + i;
      const chord = chordAt[step];

      if (!chord) {
        continue;
      }

      const bc = def.bass[i];

      if (bc && bc !== ".") {
        let next = i + 1;

        while (next < stepsPerBar && def.bass[next] === ".") {
          next++;
        }

        const off =
          bc === "5" ? FIFTH_SEMITONES : bc === "O" ? SEMITONES_PER_OCTAVE : 0;

        at(step).bass = { midi: chord.bass + off, len: next - i };
      }

      const ac = def.arp[i];

      if (ac && ac !== ".") {
        const idx = Number(ac);
        const n = chord.pad.length;
        const note = chord.pad[idx % n];

        if (note !== undefined) {
          at(step).arp =
            note +
            SEMITONES_PER_OCTAVE +
            SEMITONES_PER_OCTAVE * Math.floor(idx / n);
        }
      }

      const cc = def.comp?.[i];

      if (cc === "x") {
        at(step).comp = chord.pad;
      }

      const pc = def.perc?.[i];

      if (pc === "t" || pc === "T" || pc === "s") {
        at(step).perc = pc;
      }
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
