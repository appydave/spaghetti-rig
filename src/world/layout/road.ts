// Where things stand along the road (G13 A1): the distance between stops, the stop and stand positions, and how long the walk between stops takes.
// Moved out of world-shared.ts as it was.
export const SEGMENT = 34; // distance between stops

const STAND_PAST_GATE = 4;
const WALK_SECONDS = 9;

export const stopZ = (k: number) => -(k + 1) * SEGMENT;
export const standZ = (k: number) => stopZ(k) + STAND_PAST_GATE;
export const walkSeconds = () => WALK_SECONDS;
