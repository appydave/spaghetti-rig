// Who the two players are (G13 A2): their ids, their names on screen, which one the machine plays, and the part of a player's world the show
// touches. Moved out of shared.ts as it was.
import type * as THREE from "three";
import type { Mode, Player, Step } from "#root/src/content/script.ts";
import type { EnemyKind } from "#root/src/world/motion/enemy-motion.ts";
import type { StagedWorld } from "#root/src/world/stage.ts";

export const PLAYERS: Player[] = ["p1", "p2"];
export const WHO: Record<Player, { n: string; name: string; sub: string }> = {
  p1: { n: "PLAYER 1", name: "Vibe coder", sub: "no tools · ships fast" },
  p2: { n: "PLAYER 2", name: "Specialist", sub: "quality gates · in CI" },
};

/** In spec mode player 1 is driven by autoplay and the mouse plays player 2 only. */
export const isMachine = (mode: Mode, p: Player) =>
  p === "p1" && mode === "spec";

/** The part of a player's world the show touches: the Director steps it, the HUD and the end screens read its score, health and boss. */
export interface DirectedWorld extends StagedWorld {
  health: number;
  autoplay: boolean;
  readonly combat: {
    score: number;
    shipped: number;
    onSlip?: (kind: EnemyKind) => void;
    pointer(ndc: THREE.Vector2 | null, fire: boolean): boolean;
    autoAimScreen(): THREE.Vector2 | null;
  };
  readonly street: { bossLeft: number; bossTotal: number };
  settle(step: Step): void;
  enter(step: Step): void;
  setWalk(u: number): void;
  snapCamera(): void;
  update(dt: number): void;
}
