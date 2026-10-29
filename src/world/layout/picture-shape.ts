// How the picture is cut for the screen (G13 A1): wide or tall, where the cut falls, and how much of the width the picture may fill.
// Moved out of world-shared.ts as it was.
export type Shape = "wide" | "tall";
export const TALL_ASPECT_BELOW = 1.25;
export const USABLE_WIDTH_FRACTION = 0.94;
export const SCREEN_MIDDLE = 0.5;
