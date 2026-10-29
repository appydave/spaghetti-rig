// What the show's parts read and change (G13 A2): the Director seen from outside, what the lanes read of it, and what the clock and cues
// have been doing. Moved out of shared.ts as it was.
import type { AudioEngine } from "#root/src/audio/audio.ts";
import {
  FULL_HEALTH,
  type Game,
  type PlayTier,
} from "#root/src/content/load.ts";
import type { Mode, Player, Step } from "#root/src/content/script.ts";
import type { DirectedWorld } from "#root/src/show/director/players.ts";
import type { Stage } from "#root/src/world/stage.ts";

/** What the lanes read and act on: the show as it stands, and the way to schedule a cue. */
export interface LaneContext {
  game: Game;
  tier: PlayTier;
  step: Step;
  mode: Mode;
  paused: boolean;
  audio: AudioEngine;
  stage: Stage;
  worlds: Record<Player, DirectedWorld>;
  after: (seconds: number, fn: () => void) => void;
}

/** What the clock, the cues and the pointer have been doing since the show began. */
export interface Run {
  walkT: number;
  vsT: number;
  cues: { at: number; fn: () => void }[];
  clock: number;
  lastHealth: Record<Player, number>;
  pointer: { x: number; y: number } | null;
  readonly channel: BroadcastChannel | null;
}

export const newRun = (): Run => ({
  walkT: -1,
  vsT: -1,
  cues: [],
  clock: 0,
  lastHealth: { p1: FULL_HEALTH, p2: FULL_HEALTH },
  pointer: null,
  channel:
    "BroadcastChannel" in window ? new BroadcastChannel("spaghetti-rig") : null,
});

/** What the show's parts read and change: the Director, seen from outside. */
export interface ShowState {
  readonly game: Game;
  readonly stage: Stage;
  readonly worlds: Record<Player, DirectedWorld>;
  readonly audio: AudioEngine;
  readonly script: Step[];
  readonly run: Run;
  readonly step: Step;
  readonly tier: PlayTier;
  at: number;
  mode: Mode;
  paused: boolean;
  autoplay: boolean;
  notesOn: boolean;
  active: boolean;
  onScore?: (score: number) => void;
  next: () => void;
}

export const laneContext = (s: ShowState): LaneContext => ({
  game: s.game,
  tier: s.tier,
  step: s.step,
  mode: s.mode,
  paused: s.paused,
  audio: s.audio,
  stage: s.stage,
  worlds: s.worlds,
  after: (seconds, fn) => {
    s.run.cues.push({ at: s.run.clock + seconds, fn });
  },
});
