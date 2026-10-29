// What a player's world looks like once a step has fully happened (G13 A1): the camera mode, the gate states and the State that holds them.
// Moved out of world-shared.ts as it was.
import type { Pose } from "#root/src/world/motion/character-motion.ts";

export type CameraMode = "follow" | "stop" | "boss" | "portrait";
export type GateState = "idle" | "alarm" | "open" | "broken";
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
