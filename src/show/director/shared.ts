import type { AudioEngine } from "#root/src/audio/audio.ts";
import type { Game, PlayTier } from "#root/src/content/load.ts";
import { byId, queryElOrNull } from "#root/src/dom.ts";
import type { Mode, Player, Step } from "#root/src/show/script.ts";
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
