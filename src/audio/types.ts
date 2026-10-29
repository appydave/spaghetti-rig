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

/** What the music plays through: the audio context, the music bus and the shared noise buffer. */
export interface MusicRig {
  ctx: AudioContext;
  bus: GainNode;
  noise: AudioBuffer | null;
}

/** What the audio facade asks of the music: which theme is wanted and its track, and being given the rig once the context exists. */
export interface MusicPlayer {
  readonly theme: Theme;
  readonly trackName: string;
  onTrackChange(cb: (name: string) => void): void;
  wake(): void;
  setTheme(theme: Theme): void;
  attach(rig: MusicRig): void;
}

/** What the audio facade asks of the sound-effect player: to play an effect. */
export interface SfxOutput {
  play(sfx: Sfx, opts: PlayOptions): void;
}

/** The engines the audio facade drives: made at boot and handed in, so the facade does not construct them. */
export interface AudioParts {
  music: MusicPlayer;
  makeSfx(
    ctx: AudioContext,
    bus: GainNode,
    noise: AudioBuffer | null,
  ): SfxOutput;
}
