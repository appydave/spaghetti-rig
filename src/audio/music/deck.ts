import type { CompiledTrack } from "#root/src/audio/tracks.ts";

/** One track playing: the audio context and noise buffer its voices draw on, its output, its echo send, the nodes to free when it ends, and where the score has got to. */
export interface Deck {
  track: CompiledTrack;
  ctx: AudioContext;
  noise: AudioBuffer | null;
  out: GainNode;
  delayIn: GainNode;
  fx: AudioNode[];
  start: number;
  abs: number;
  stopAt: number | null;
}

/** Where and when a music voice sounds, and how loud: what every voice is given first. */
export interface Note {
  deck: Deck;
  t: number;
  level: number;
}
