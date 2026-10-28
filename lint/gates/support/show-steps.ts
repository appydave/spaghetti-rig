import type { Phase } from "../../../src/show/script";
import type { Show } from "../director-show";

const FRAMES_PER_SECOND = 20;
const LIMIT = 1000;

/** Start the first tier and step `show` to the first step in `phase`. */
export function stepTo(show: Show, phase: Phase): Show {
  const d = show.director;

  d.startTier(0);
  for (let guard = 0; guard < LIMIT && d.step.phase !== phase; guard++) {
    d.next();
  }

  return show;
}

/** Run `seconds` of frames (the harness steps 0.05 s a frame). */
export const framesFor = (show: Show, seconds: number) =>
  show.frames(Math.round(seconds * FRAMES_PER_SECOND));
