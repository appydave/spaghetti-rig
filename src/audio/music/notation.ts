// The score's notation: note names to MIDI and to frequency, a melody bar's tokens, and a chord entry. Moved out of audio/tracks.ts; the
// notation itself is described at the top of that file.

/** One octave of piano keys, a dot where a black key sits: a letter's index is its semitone above C. */
const NATURAL_KEYS = "C.D.EF.G.A.B";

export const SEMITONES_PER_OCTAVE = 12;

const A4_MIDI = 69;
const A4_HZ = 440;

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
