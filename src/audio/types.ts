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
  /** Free text for whoever edits the score (chord names such as Fmaj7); the engine ignores it. */
  notes?: string;
}

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
