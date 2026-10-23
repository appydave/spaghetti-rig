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

import { nth } from "../nth";

export type Theme =
  "title" | "walk" | "stop" | "boss" | "victory" | "defeat" | "silent";
export type MusicTheme = Exclude<Theme, "silent">;

export type LeadVoice = "triangle" | "sine" | "pluck" | "saw" | "square";
export type PadVoice = "warm" | "glass" | "dark";
export type ArpVoice = "pluck" | "bell";

export interface TrackMix {
  lead?: number;
  pad?: number;
  arp?: number;
  bass?: number;
  comp?: number;
  perc?: number;
}

export interface TrackDef {
  name: string;
  theme: MusicTheme;
  bpm: number;
  /** Beats per bar (4 = 4/4, 3 = waltz). A beat is four 16th steps. */
  beatsPerBar: number;
  /** How many times the loop plays before a multi-track theme rotates. */
  loops: number;
  /** 0..0.4 — delays every off 16th by this fraction of a step. */
  swing?: number;
  lead: LeadVoice;
  pad: PadVoice;
  arpVoice: ArpVoice;
  harmony: string[];
  melody: string[];
  bass: string;
  arp: string;
  comp?: string;
  perc?: string;
  mix?: TrackMix;
}

// ---------------------------------------------------------------------------
// The score
// ---------------------------------------------------------------------------

export const TRACK_DEFS: TrackDef[] = [
  // ---------------------------------------------------------------- title
  {
    name: "Hello, World",
    theme: "title",
    bpm: 104,
    beatsPerBar: 4,
    loops: 4,
    lead: "sine",
    pad: "glass",
    arpVoice: "bell",
    harmony: [
      "F2: A3 C4 E4", // Fmaj7
      "E2: G3 C4 E4", // C/E
      "D2: A3 C4 F4", // Dm7
      "Bb1: A3 D4 F4", // Bbmaj7
      "A1: A3 C4 F4", // F/A
      "G2: Bb3 D4 F4", // Gm7
      "C2: Bb3 D4 F4", // Bb/C
      "C2: G3 C4 E4", // C
    ],
    melody: [
      "C6/6 A5/2 G5/4 A5/4",
      "G5/8 E5/4 r/4",
      "F5/4 A5/4 C6/4 D6/4",
      "D6/8 C6/4 A5/4",
      "C6/6 A5/2 F5/4 G5/4",
      "A5/4 Bb5/4 D6/8",
      "C6/8 Bb5/4 A5/4",
      "G5/12 r/4",
    ],
    bass: "R...............",
    arp: "0.1.2.3.4.3.2.1.",
    mix: { lead: 0.8, arp: 0.8, bass: 0.8 },
  },

  // ----------------------------------------------------------------- walk
  {
    name: "Green Checkmarks",
    theme: "walk",
    bpm: 128,
    beatsPerBar: 4,
    loops: 2,
    lead: "triangle",
    pad: "warm",
    arpVoice: "pluck",
    harmony: [
      "C2: E3 G3 C4",
      "B1: D3 G3 B3",
      "A1: E3 A3 C4",
      "F1: F3 A3 C4",
      "C2: E3 G3 C4",
      "B1: D3 G3 B3",
      "F1: F3 A3 C4",
      "G1: D3 G3 B3",
      "F1: F3 A3 C4",
      "G1: D3 G3 B3",
      "E2: E3 G3 B3",
      "A1: E3 A3 C4",
      "D2: F3 A3 D4",
      "G1: D3 G3 B3",
      "C2: E3 G3 C4",
      "G1: D3 F3 B3",
    ],
    melody: [
      "E5/2 G5/2 C6/4 B5/2 G5/2 E5/4",
      "D5/2 G5/2 B5/4 A5/2 G5/2 D5/4",
      "C5/2 E5/2 A5/3 G5/1 A5/2 C6/2 B5/2 A5/2",
      "A5/6 G5/2 F5/2 E5/2 F5/2 G5/2",
      "E5/2 G5/2 C6/4 B5/2 G5/2 E5/4",
      "D5/2 G5/2 B5/4 D6/4 B5/4",
      "C6/3 A5/3 F5/2 A5/2 C6/2 D6/2 C6/2",
      "B5/4 A5/2 B5/2 G5/8",
      "r/2 A5/2 A5/2 G5/2 A5/2 C6/4 A5/2",
      "B5/2 G5/2 D5/2 G5/2 B5/4 r/4",
      "r/2 B5/2 B5/2 A5/2 B5/2 E6/4 D6/2",
      "C6/4 B5/2 A5/2 E5/8",
      "F5/2 A5/2 D6/4 C6/2 A5/2 F5/4",
      "G5/2 B5/2 D6/4 F6/4 D6/4",
      "E6/4 D6/2 C6/2 G5/2 E5/2 C5/4",
      "D5/2 E5/2 F5/2 G5/2 B5/4 D6/4",
    ],
    bass: "R...R.O...R.5...",
    arp: "0.2.1.2.3.2.1.2.",
    perc: "..t...t...t...t.",
  },
  {
    name: "Works On My Machine",
    theme: "walk",
    bpm: 136,
    beatsPerBar: 4,
    loops: 2,
    swing: 0.14,
    lead: "square",
    pad: "warm",
    arpVoice: "bell",
    harmony: [
      "D2: F#3 A3 D4",
      "B1: F#3 B3 D4",
      "G1: G3 B3 D4",
      "A1: E3 A3 C#4",
      "D2: F#3 A3 D4",
      "F#2: F#3 A3 C#4",
      "G2: G3 B3 D4",
      "A2: E3 A3 C#4",
      "G2: G3 B3 D4",
      "G2: G3 Bb3 D4",
      "F#2: F#3 A3 D4",
      "B1: F#3 B3 D4",
      "E2: G3 B3 E4",
      "A2: E3 A3 C#4",
      "D2: F#3 A3 D4",
      "A2: E3 G3 C#4",
    ],
    melody: [
      "A5/3 F#5/3 D5/2 E5/2 F#5/2 A5/4",
      "B5/3 F#5/3 D5/2 F#5/2 B5/2 A5/4",
      "G5/2 A5/2 B5/2 D6/4 B5/2 A5/2 G5/2",
      "A5/6 E5/2 C#5/4 E5/4",
      "A5/3 F#5/3 D5/2 E5/2 F#5/2 A5/4",
      "C#6/3 A5/3 F#5/2 A5/2 C#6/2 E6/4",
      "D6/2 B5/2 G5/2 B5/2 D6/2 B5/2 G5/2 B5/2",
      "A5/4 G5/2 F#5/2 E5/8",
      "r/4 B5/2 C#6/2 D6/4 B5/4",
      "r/4 Bb5/2 A5/2 G5/4 D5/4",
      "F#5/2 A5/2 D6/4 C#6/2 D6/2 A5/4",
      "B5/6 A5/2 F#5/4 D5/4",
      "E5/2 G5/2 B5/4 A5/2 G5/2 E5/4",
      "C#6/2 B5/2 A5/2 G5/2 E5/4 A5/4",
      "F#5/4 A5/4 D6/6 r/2",
      "C#6/2 B5/2 A5/2 G5/2 E5/2 C#5/2 E5/2 G5/2",
    ],
    bass: "R..R..5.O..R.5..",
    arp: "0..1..2..3..2..1",
    perc: "....t.......t..s",
    mix: { lead: 0.75 },
  },
  {
    name: "Merge Conflict Waltz",
    theme: "walk",
    bpm: 138,
    beatsPerBar: 3,
    loops: 3,
    lead: "triangle",
    pad: "glass",
    arpVoice: "bell",
    harmony: [
      "G2: B3 D4 G4",
      "E2: B3 E4 G4",
      "A2: C4 E4 A4",
      "D2: C4 F#4 A4",
      "G2: B3 D4 G4",
      "E2: B3 D4 G#4",
      "A2: C4 E4 A4",
      "D2: C4 F#4 A4",
      "C2: C4 E4 G4",
      "C2: C4 Eb4 G4",
      "B1: B3 D4 G4",
      "E2: B3 D4 G#4",
      "A2: C4 E4 A4",
      "D2: C4 F#4 A4",
      "G2: B3 D4 G4",
      "D2: C4 F#4 A4",
    ],
    melody: [
      "D5/8 G5/2 B5/2",
      "B5/8 A5/2 G5/2",
      "E5/6 A5/2 C6/2 B5/2",
      "A5/8 F#5/2 E5/2",
      "D5/8 G5/2 B5/2",
      "D6/6 B5/2 G#5/2 B5/2",
      "C6/8 B5/2 A5/2",
      "F#5/6 A5/2 D5/4",
      "E5/2 G5/2 C6/8",
      "Eb6/6 D6/2 C6/2 G5/2",
      "D6/8 B5/4",
      "G#5/2 B5/2 E6/6 D6/2",
      "C6/4 E6/4 C6/2 A5/2",
      "B5/2 A5/2 F#5/4 A5/2 C6/2",
      "B5/8 r/4",
      "A5/2 B5/2 A5/2 F#5/2 E5/2 C5/2",
    ],
    bass: "R...........",
    arp: "0.1.2.3.2.1.",
    comp: "....x...x...",
    mix: { arp: 0.6, pad: 0.7 },
  },

  // ----------------------------------------------------------------- stop
  {
    name: "Rubber Duck Debugging",
    theme: "stop",
    bpm: 110,
    beatsPerBar: 4,
    loops: 4,
    lead: "pluck",
    pad: "dark",
    arpVoice: "bell",
    harmony: [
      "A1: E3 A3 C4", // Am
      "A1: F3 Bb3 D4", // Bb/A — the nervous semitone
      "A1: E3 A3 C4",
      "A1: F3 Bb3 D4",
      "F1: F3 A3 C4", // F
      "E2: E3 G#3 B3", // E
      "D2: F3 A3 D4", // Dm
      "E2: D3 G#3 B3", // E7
    ],
    melody: [
      "A4/2 r/2 C5/2 r/2 E5/2 r/2 D#5/1 E5/1 r/2",
      "F5/2 r/6 D5/2 r/6",
      "A4/2 r/2 C5/2 r/2 E5/2 r/2 A5/2 G#5/2",
      "F5/6 r/10",
      "C5/2 r/2 A4/2 r/2 C5/2 F5/2 E5/2 r/2",
      "E5/2 G#5/2 B5/4 r/8",
      "A5/2 r/2 F5/2 r/2 D5/2 r/2 F5/2 A5/2",
      "G#5/6 r/2 E5/2 r/2 B4/2 r/2",
    ],
    bass: "R..R.......R....",
    arp: "0.....2.....1...",
    comp: "......x.......x.",
    perc: "t...t...t...t...",
    mix: { lead: 1.1, pad: 0.8, comp: 0.7, perc: 0.8 },
  },

  // ----------------------------------------------------------------- boss
  {
    name: "Stack Overflow",
    theme: "boss",
    bpm: 144,
    beatsPerBar: 4,
    loops: 4,
    lead: "saw",
    pad: "dark",
    arpVoice: "pluck",
    harmony: [
      "E2: G3 B3 E4",
      "C2: G3 C4 E4",
      "A1: A3 C4 E4",
      "B1: A3 D#4 F#4",
      "E2: G3 B3 E4",
      "C2: G3 C4 E4",
      "D2: F#3 A3 D4",
      "B1: A3 D#4 F#4",
    ],
    melody: [
      "E5/2 G5/2 B5/2 E6/4 D6/2 B5/2 G5/2",
      "E6/2 D6/2 C6/2 G5/4 E5/2 G5/2 C6/2",
      "A5/2 C6/2 E6/4 D6/2 C6/2 B5/2 A5/2",
      "B5/6 A5/2 F#5/4 D#5/4",
      "E5/2 G5/2 B5/2 E6/4 D6/2 B5/2 G5/2",
      "G6/4 E6/2 C6/2 G5/4 C6/4",
      "F#6/2 E6/2 D6/2 A5/2 F#5/2 A5/2 D6/2 E6/2",
      "F#6/4 D#6/4 B5/4 F#5/4",
    ],
    bass: "R.R.R.R.O.R.5.R.",
    arp: "0121312101213121",
    comp: "..x...x...x...x.",
    perc: "..t...t...t.t.tT",
    mix: { lead: 0.8, arp: 0.7, comp: 0.6 },
  },

  // -------------------------------------------------------------- victory
  {
    name: "Ship It!",
    theme: "victory",
    bpm: 132,
    beatsPerBar: 4,
    loops: 8,
    lead: "triangle",
    pad: "warm",
    arpVoice: "bell",
    harmony: [
      "G2: B3 D4 G4",
      "E2: B3 E4 G4 *2",
      "C2: C4 E4 G4 *2",
      "D2: A3 D4 F#4",
      "G2: B3 D4 G4",
    ],
    melody: [
      "D5/2 G5/2 B5/2 D6/6 B5/2 D6/2",
      "E6/4 G6/4 E6/2 D6/2 C6/2 E6/2",
      "D6/2 C6/2 B5/2 A5/2 F#5/2 A5/2 D6/4",
      "G6/8 D6/2 B5/2 G5/4",
    ],
    bass: "R...5...O...5...",
    arp: "0123012301230123",
    perc: "..t...t...t...t.",
    mix: { arp: 0.6 },
  },

  // --------------------------------------------------------------- defeat
  {
    name: "Segfault Lullaby",
    theme: "defeat",
    bpm: 100,
    beatsPerBar: 4,
    loops: 8,
    lead: "sine",
    pad: "glass",
    arpVoice: "bell",
    harmony: [
      "C2: G3 C4 Eb4", // Cm
      "Ab1: Ab3 C4 Eb4", // Ab
      "F2: Ab3 C4 F4", // Fm
      "G1: G3 B3 F4", // G7
    ],
    melody: [
      "G5/6 F5/2 Eb5/4 D5/4",
      "C5/6 Eb5/2 Ab5/8",
      "G5/4 F5/2 Eb5/2 F5/4 Ab5/4",
      "G5/8 F5/2 D5/2 B4/4",
    ],
    bass: "R.......5.......",
    arp: "0.1.2.1.0.1.2.1.",
    mix: { arp: 0.6 },
  },
];

// ---------------------------------------------------------------------------
// Parsing / compiling
// ---------------------------------------------------------------------------

const PITCH_CLASS = new Map([
  ["C", 0],
  ["D", 2],
  ["E", 4],
  ["F", 5],
  ["G", 7],
  ["A", 9],
  ["B", 11],
]);

/** "C4" -> 60, "F#5" -> 78, "Bb1" -> 34. Throws on bad input. */
export function parseNote(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`Bad note "${name}"`);
  const pc = PITCH_CLASS.get(m[1] ?? "");
  if (pc === undefined) throw new Error(`Bad note "${name}"`);
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + pc + acc;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
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
      if (!note || !Number.isInteger(len) || len <= 0)
        throw new Error(`Bad melody token "${tok}"`);
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
  if (!bassStr || rest === undefined) throw new Error(`Bad chord "${entry}"`);
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
  const stepsPerBar = def.beatsPerBar * 4;
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
    const len = c.beats * 4;
    if (pos < totalSteps) at(pos).chord = { pad: c.pad, bass: c.bass, len };
    for (let i = 0; i < len && pos + i < totalSteps; i++) chordAt[pos + i] = c;
    pos += len;
  }

  // Melody
  for (const [b, bar] of def.melody.entries()) {
    let s = b * stepsPerBar;
    for (const tok of parseMelodyBar(bar)) {
      if (tok.midi !== null && s < totalSteps)
        at(s).lead = { midi: tok.midi, len: tok.len };
      s += tok.len;
    }
  }

  // Per-bar patterns
  for (let b = 0; b < bars; b++) {
    const base = b * stepsPerBar;
    for (let i = 0; i < stepsPerBar; i++) {
      const step = base + i;
      const chord = chordAt[step];
      if (!chord) continue;
      const bc = def.bass[i];
      if (bc && bc !== ".") {
        let next = i + 1;
        while (next < stepsPerBar && def.bass[next] === ".") next++;
        const off = bc === "5" ? 7 : bc === "O" ? 12 : 0;
        at(step).bass = { midi: chord.bass + off, len: next - i };
      }
      const ac = def.arp[i];
      if (ac && ac !== ".") {
        const idx = Number(ac);
        const n = chord.pad.length;
        const note = chord.pad[idx % n];
        if (note !== undefined)
          at(step).arp = note + 12 + 12 * Math.floor(idx / n);
      }
      const cc = def.comp?.[i];
      if (cc === "x") at(step).comp = chord.pad;
      const pc = def.perc?.[i];
      if (pc === "t" || pc === "T" || pc === "s") at(step).perc = pc;
    }
  }

  const stepSec = 60 / def.bpm / 4;
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
