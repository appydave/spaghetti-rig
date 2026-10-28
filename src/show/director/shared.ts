import { byId } from "#root/src/dom.ts";
import type { Player } from "#root/src/show/script.ts";

export const $ = (id: string) => byId(id, HTMLElement);

/** Scores are shown as this many digits, padded with zeros. */
export const SCORE_DIGITS = 6;

export const PLAYERS: Player[] = ["p1", "p2"];
export const WHO: Record<Player, { n: string; name: string; sub: string }> = {
  p1: { n: "PLAYER 1", name: "Vibe coder", sub: "no tools · ships fast" },
  p2: { n: "PLAYER 2", name: "Specialist", sub: "quality gates · in CI" },
};
