// A recording stand-in for the app, for the tests of the keyboard: each call the keys make on it is appended to `log`, and `state` is the
// screen, choice, pause and help the keys read. Used by src/app/keys.test.ts and src/app/key-listeners.test.ts.
import type { AppContext, Screen } from "#root/src/app/context.ts";
import { key } from "#root/src/app/keys.ts";

export interface State {
  screen: Screen;
  selected: number;
  paused: boolean;
  help: boolean;
}

/** Tier numbers 1, 2 and 7: digit 3 has no tier numbered 3 and falls back to the third tier; digit 4 finds nothing. */
const FIRST_INDEX = 10;
const SEVENTH = 7;
const TIERS = [
  { n: 1, index: FIRST_INDEX },
  { n: 2, index: FIRST_INDEX + 1 },
  { n: SEVENTH, index: FIRST_INDEX + 2 },
];

export const state: State = {
  screen: "title",
  selected: 1,
  paused: false,
  help: false,
};
export const log: string[] = [];

const note = (entry: string) => () => void log.push(entry);

export const ctx: AppContext = {
  get screen() {
    return state.screen;
  },
  get selected() {
    return state.selected;
  },
  set selected(v: number) {
    state.selected = v;
    log.push(`selected=${v}`);
  },
  tiers: TIERS,
  director: {
    get paused() {
      return state.paused;
    },
    setPaused: (p: boolean) => void log.push(`setPaused:${p}`),
    toggleNotes: note("notes"),
    toggleAutoplay: note("auto"),
    next: note("next"),
    back: note("back"),
  },
  audio: { play: (name) => void log.push(`play:${name}`) },
  helpOpen: () => state.help,
  closeHelp: note("closeHelp"),
  show: (s) => void log.push(`show:${s}`),
  start: (i) => void log.push(`start:${i}`),
  enter: () => {
    log.push("enter");

    return Promise.resolve();
  },
  toggleMute: note("mute"),
  toggleHelp: note("help"),
  togglePause: note("pause"),
  setMode: (m) => void log.push(`setMode:${m}`),
  renderMap: note("renderMap"),
};

/** Press `code` (with shift, and the `k` character) and return the calls it made. */
export function press(code: string, shift = false, k = "") {
  log.length = 0;
  key(ctx, code, shift, k);

  return [...log];
}

/** Back to the title, nothing paused, help shut, tier 1 chosen, an empty log. */
export function reset() {
  Object.assign(state, {
    screen: "title",
    selected: 1,
    paused: false,
    help: false,
  });
  log.length = 0;
}
