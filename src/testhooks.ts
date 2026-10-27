// What the e2e specs may read off window.__rig (G04 test-hooks). The app's rig is checked against this type in main.ts, and every spec
// reads it through a lambda that tsc checks against it, so a refactor that drops a member a spec uses fails the build, not just the e2e.
import type { AudioEngine } from "#root/src/audio/audio.ts";
import type { Game } from "#root/src/content/load.ts";
import type { Director } from "#root/src/show/director.ts";
import type { Player } from "#root/src/show/script.ts";
import type { PlayerWorld } from "#root/src/world/world.ts";

export interface TestHooks {
  director: Pick<Director, "at" | "step" | "script" | "go">;
  worlds: Record<
    Player,
    Pick<
      PlayerWorld,
      | "shots"
      | "score"
      | "shipped"
      | "health"
      | "bossLeft"
      | "bossTotal"
      | "debrisCount"
      | "enemyScreen"
      | "windowKey"
    >
  >;
  game: Game;
  audio: Pick<AudioEngine, "muted">;
  start: (tierIndex: number) => void;
}

declare global {
  interface Window {
    __rig?: TestHooks;
  }
}
