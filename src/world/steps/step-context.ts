// What a step handler may touch of the world it plays in (G04 W5d): the parts it animates, the player's health and the camera shake,
// and the two things only the world can do (play a sound, and make the world match a state). The world builds one and hands it to the handlers.
import type * as THREE from "three";
import type { Sfx } from "#root/src/audio/audio.ts";
import type { Game } from "#root/src/content/load.ts";
import type { Player } from "#root/src/content/script.ts";
import type { CameraRig } from "#root/src/world/camera-rig.ts";
import type { Character } from "#root/src/world/models/characters.ts";
import type { Combat } from "#root/src/world/combat/combat.ts";
import type { Effects } from "#root/src/world/combat/effects.ts";
import type { Debris } from "#root/src/world/combat/physics.ts";
import type { Street } from "#root/src/world/street.ts";
import type { Timeline } from "#root/src/world/timeline.ts";
import type { State } from "#root/src/world/world-shared.ts";

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
