import type {
  ArpVoice,
  LeadVoice,
  MusicTheme,
  PadVoice,
  TrackDef,
  TrackMix,
} from "#root/src/audio/types.ts";
import { isObj, str, strs } from "#root/src/loose.ts";

/** The one place audio data enters the game: loose JSON in, typed values out, defaults for what is left out. */

const THEMES = ["title", "walk", "stop", "boss", "victory", "defeat"] as const;
const LEAD_VOICES = ["triangle", "sine", "pluck", "saw", "square"] as const;
const PAD_VOICES = ["warm", "glass", "dark"] as const;
const ARP_VOICES = ["pluck", "bell"] as const;
const MIX_PARTS = ["lead", "pad", "arp", "bass", "comp", "perc"] as const;

const DEFAULT_BPM = 120;
const DEFAULT_BEATS_PER_BAR = 4;
const DEFAULT_LOOPS = 1;

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const oneOf = <T extends string>(
  v: unknown,
  list: readonly T[],
  fallback: T,
): T => list.find((x) => x === v) ?? fallback;

function mix(v: unknown): TrackMix | undefined {
  if (!isObj(v)) {
    return undefined;
  }

  const out: TrackMix = {};

  for (const part of MIX_PARTS) {
    const level = v[part];

    if (typeof level === "number") {
      out[part] = level;
    }
  }

  return out;
}

function theme(v: unknown, name: string): MusicTheme {
  const found = THEMES.find((t) => t === v);

  if (!found) {
    throw new Error(`Track "${name}" has no known theme`);
  }

  return found;
}

export function parseTrackDefs(raw: unknown): TrackDef[] {
  return (Array.isArray(raw) ? raw.filter((o) => isObj(o)) : []).map((t) => {
    const name = str(t.name);

    return {
      name,
      theme: theme(t.theme, name),
      bpm: num(t.bpm, DEFAULT_BPM),
      beatsPerBar: num(t.beatsPerBar, DEFAULT_BEATS_PER_BAR),
      loops: num(t.loops, DEFAULT_LOOPS),
      swing: typeof t.swing === "number" ? t.swing : undefined,
      lead: oneOf<LeadVoice>(t.lead, LEAD_VOICES, "triangle"),
      pad: oneOf<PadVoice>(t.pad, PAD_VOICES, "warm"),
      arpVoice: oneOf<ArpVoice>(t.arpVoice, ARP_VOICES, "pluck"),
      harmony: strs(t.harmony),
      melody: strs(t.melody),
      bass: str(t.bass),
      arp: str(t.arp),
      comp: typeof t.comp === "string" ? t.comp : undefined,
      perc: typeof t.perc === "string" ? t.perc : undefined,
      mix: mix(t.mix),
      notes: typeof t.notes === "string" ? t.notes : undefined,
    };
  });
}
