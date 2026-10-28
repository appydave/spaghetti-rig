import type { AppContext } from "#root/src/app/context.ts";

type Action = (c: AppContext) => void;

const pause: Action = (c) => {
  if (c.helpOpen()) {
    c.closeHelp();
  }

  c.togglePause();
};

/** What each `data-action` button on the page does. */
const ACTIONS = new Map<string | undefined, Action>([
  ["mute", (c) => c.toggleMute()],
  ["pause", pause],
  ["help", (c) => c.toggleHelp()],
  [
    "to-map",
    (c) => {
      c.director.setPaused(false);
      c.show("map");
    },
  ],
  [
    "auto",
    (c) => {
      c.director.toggleAutoplay();
      c.audio.play("uiMove");
    },
  ],
]);

/** A click on a `data-action` button: run its action; a name nobody knows does nothing. */
export const clickAction = (c: AppContext, act: string | undefined) =>
  ACTIONS.get(act)?.(c);
