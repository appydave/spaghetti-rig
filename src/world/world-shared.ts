// What the parts of a player's world share (G04 W1): the stop and stand positions along the road, the walk's length, a few tuning numbers
// used by more than one part, and the shapes the world's steps, tweens and cues take. Moved out of world.ts as it was.
import * as THREE from "three";
import { SEGMENT } from "#root/src/world/city.ts";
import type { Pose } from "#root/src/world/characters.ts";
import type { GateState } from "#root/src/world/gate.ts";

export type CameraMode = "follow" | "stop" | "boss" | "portrait";
export type Shape = "wide" | "tall";
export const stopZ = (k: number) => -(k + 1) * SEGMENT;
export const standZ = (k: number) => stopZ(k) + STAND_PAST_GATE;
export const WALK_SECONDS = 9;
export const STAND_PAST_GATE = 4;
export const BOSS_HEIGHT = 6.2;
export const DEBT_WINDOW_COLS = 30;
export const RANDOM_CENTRE = 0.5;
/** A random vector with each component within half of `size` either side of zero (a camera shake, a debris spin). */
export const randomSpread = (size: number) =>
  new THREE.Vector3(
    (Math.random() - RANDOM_CENTRE) * size,
    (Math.random() - RANDOM_CENTRE) * size,
    (Math.random() - RANDOM_CENTRE) * size,
  );
export const KILL_TEXT_SIZE = 0.8;
export const TALL_ASPECT_BELOW = 1.25;
export const USABLE_WIDTH_FRACTION = 0.94;
export const SCREEN_MIDDLE = 0.5;
/** Boss arena: how far down the road the boss stands and how high its main window floats. */
export const BOSS = { y: BOSS_HEIGHT };
export const walkSeconds = () => WALK_SECONDS;
export interface Tween {
  age: number;
  dur: number;
  fn: (k: number) => void;
  done?: () => void;
}
export interface Cue {
  at: number;
  fn: () => void;
}
/** What a player's world looks like once a step has fully happened. */
export interface State {
  tier: number;
  z: number;
  camera: CameraMode;
  window: "none" | "problem" | "fixed";
  stop: number;
  debt: number;
  gates: GateState[];
  boss: "none" | "alive" | "dead";
  broken: number;
  pose: Pose;
  pile: boolean;
  health: number;
}
