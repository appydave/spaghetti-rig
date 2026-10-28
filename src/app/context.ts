import type { AudioEngine } from "#root/src/audio/audio.ts";
import type { Director } from "#root/src/show/director.ts";
import type { Mode } from "#root/src/content/script.ts";

export type Screen = "prelude" | "title" | "map" | "game";

/** What the keyboard can reach: the current screen, the tier choice and the actions boot owns. Boot fills it in once. */
export interface AppContext {
  readonly screen: Screen;
  selected: number;
  readonly tiers: readonly { n: number; index: number }[];
  readonly director: Pick<
    Director,
    "paused" | "setPaused" | "toggleNotes" | "toggleAutoplay" | "next" | "back"
  >;
  readonly audio: Pick<AudioEngine, "play">;
  helpOpen(): boolean;
  closeHelp(): void;
  show(s: Screen): void;
  start(tierIndex: number): void;
  enter(): Promise<void>;
  toggleMute(): void;
  toggleHelp(): void;
  togglePause(): void;
  setMode(m: Mode): void;
  renderMap(): void;
}
