import type { AudioEngine } from "#root/src/audio/audio.ts";
import {
  FULL_HEALTH,
  type Game,
  type PlayTier,
} from "#root/src/content/load.ts";
import { byId, queryElOrNull } from "#root/src/dom.ts";
import type { Mode, Player, Step } from "#root/src/content/script.ts";
import type { Stage } from "#root/src/world/stage.ts";
import type { PlayerWorld } from "#root/src/world/world.ts";

export const $ = (id: string) => byId(id, HTMLElement);

/** Scores are shown as this many digits, padded with zeros. */
export const SCORE_DIGITS = 6;

export const PLAYERS: Player[] = ["p1", "p2"];
export const WHO: Record<Player, { n: string; name: string; sub: string }> = {
  p1: { n: "PLAYER 1", name: "Vibe coder", sub: "no tools · ships fast" },
  p2: { n: "PLAYER 2", name: "Specialist", sub: "quality gates · in CI" },
};

/** What the lanes read and act on: the show as it stands, and the way to schedule a cue. */
export interface LaneContext {
  game: Game;
  tier: PlayTier;
  step: Step;
  mode: Mode;
  paused: boolean;
  audio: AudioEngine;
  stage: Stage;
  worlds: Record<Player, PlayerWorld>;
  after: (seconds: number, fn: () => void) => void;
}

/** In spec mode player 1 is driven by autoplay and the mouse plays player 2 only. */
export const isMachine = (mode: Mode, p: Player) =>
  p === "p1" && mode === "spec";

export const laneEl = (p: Player) =>
  queryElOrNull(document, `.lane[data-p='${p}']`);

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
  readonly worlds: Record<Player, PlayerWorld>;
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
