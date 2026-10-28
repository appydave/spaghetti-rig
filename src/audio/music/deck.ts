import type { CompiledTrack } from "#root/src/audio/tracks.ts";

/** One track playing: its output, its echo send, the nodes to free when it ends, and where the score has got to. */
export interface Deck {
  track: CompiledTrack;
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
