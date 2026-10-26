// What a step handler may touch of the world it plays in (G04 W5d): the parts it animates, the player's health and the camera shake,
// and the two things only the world can do (play a sound, and make the world match a state). The world builds one and hands it to the handlers.
import type * as THREE from "three";
import type { Sfx } from "../audio/audio";
import type { Game } from "../content/load";
import type { Player } from "../show/script";
import type { CameraRig } from "./camera-rig";
import type { Character } from "./characters";
import type { Combat } from "./combat";
import type { Effects } from "./effects";
import type { Debris } from "./physics";
import type { Street } from "./street";
import type { Timeline } from "./timeline";
import type { State } from "./world-shared";

export type StepContext = {
  readonly player: Player;
  readonly game: Game;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: CameraRig;
  readonly character: Character;
  readonly street: Street;
  readonly combat: Combat;
  readonly timeline: Timeline;
  readonly fx: Effects;
  readonly debris: Debris;
  health(): number;
  setHealth(h: number): void;
  setShake(v: number): void;
  sfx(name: Sfx, volume?: number): void;
  reconcile(s: State): void;
};

/** The stop's window as the street holds it. */
export type StopWindow = Street["shownWindow"];
