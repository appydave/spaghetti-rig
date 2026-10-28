import type { AppContext } from "#root/src/app/context.ts";
import { MODES } from "#root/src/content/script.ts";

type Action = (c: AppContext) => void;
type Table = Map<string, Action>;

const ADVANCE = ["Enter", "Space", "ArrowRight"];
const every = (codes: string[], action: Action): [string, Action][] =>
  codes.map((code) => [code, action]);

const enterShow: Action = (c) => void c.enter();
const openMap: Action = (c) => {
  c.show("map");
  c.audio.play("uiSelect");
};

const moveChoice =
  (by: 1 | -1): Action =>
  (c) => {
    c.selected = (c.selected + by + c.tiers.length) % c.tiers.length;
    c.renderMap();
    c.audio.play("uiMove");
  };

const startChoice: Action = (c) => c.start(c.selected);
const pause: Action = (c) => c.togglePause();
const notes: Action = (c) => c.director.toggleNotes();
const autoplay: Action = (c) => {
  c.director.toggleAutoplay();
  c.audio.play("uiMove");
};

const next: Action = (c) => c.director.next();
const back: Action = (c) => c.director.back();
const escape: Action = (c) => {
  if (c.helpOpen()) {
    c.closeHelp();

    return;
  }

  if (c.screen === "game") {
    if (c.director.paused) {
      c.director.setPaused(false);
    }

    c.show("map");
  } else if (c.screen === "map") {
    c.show("title");
  }
};

/** Every key, from the key code to the action, for each screen. The prelude and the title take the same three keys. */
const PRELUDE: Table = new Map(every(ADVANCE, enterShow));
const TITLE: Table = new Map(every(ADVANCE, openMap));
const MAP: Table = new Map([
  ["ArrowRight", moveChoice(1)],
  ["ArrowLeft", moveChoice(-1)],
  ["Enter", startChoice],
  ["Space", startChoice],
]);
const GAME_ALWAYS: [string, Action][] = [
  ["KeyP", pause],
  ["KeyN", notes],
  ["KeyA", autoplay],
];
const GAME_PAUSED: Table = new Map([
  ...GAME_ALWAYS,
  ...every(["Space", "ArrowRight"], pause),
]);
const GAME_RUNNING: Table = new Map([
  ...GAME_ALWAYS,
  ...every(["ArrowRight", "Space", "PageDown", "Enter"], next),
  ...every(["ArrowLeft", "PageUp"], back),
]);

/** Shift and a digit starts the tier numbered so, else the tier in that position. */
function startTier(c: AppContext, n: number) {
  const t = c.tiers.find((x) => x.n === n) ?? c.tiers[n - 1];

  if (t) {
    c.selected = t.index;
    c.start(t.index);
  }
}

/** The keys that work on every screen after the prelude: mute, help, a mode, Escape. */
function everywhere(code: string, k: string): Action | undefined {
  if (code === "KeyM") {
    return (c) => c.toggleMute();
  }

  if (code === "KeyH" || k === "?") {
    return (c) => c.toggleHelp();
  }

  const pick = MODES.find((m) => m.code === code);

  if (pick) {
    return (c) => c.setMode(pick.mode);
  }

  return code === "Escape" ? escape : undefined;
}

function screenKeys(c: AppContext): Table {
  if (c.screen === "title") {
    return TITLE;
  }

  if (c.screen === "map") {
    return MAP;
  }

  return c.director.paused ? GAME_PAUSED : GAME_RUNNING;
}

/** Every key, so the whole show runs from the keyboard. */
export function key(c: AppContext, code: string, shift: boolean, k: string) {
  if (c.screen === "prelude") {
    PRELUDE.get(code)?.(c);

    return;
  }

  const digit = /^Digit([1-9])$/.exec(code)?.[1];

  if (shift && digit) {
    startTier(c, Number(digit));

    return;
  }

  const action = everywhere(code, k) ?? screenKeys(c).get(code);

  action?.(c);
}

/** The keys the page must not scroll or move focus with. */
const SCROLL_KEYS = new Set([
  "Space",
  "ArrowRight",
  "ArrowLeft",
  "ArrowUp",
  "ArrowDown",
  "PageDown",
  "PageUp",
]);
/** The keys that repeat while held. */
const REPEAT_KEYS = new Set(["ArrowRight", "ArrowLeft"]);
/** The presenter window's commands, as the key each one presses. */
const RIG_COMMANDS = new Map<string, [string, boolean]>([
  ["next", ["ArrowRight", false]],
  ["back", ["ArrowLeft", false]],
  ["pause", ["KeyP", false]],
  ["p1", ["Digit1", false]],
  ["p2", ["Digit2", false]],
  ["both", ["KeyB", false]],
  ["spec", ["KeyS", false]],
  ["auto", ["KeyA", false]],
]);

function onKeydown(c: AppContext, e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey) {
    return;
  }

  if (SCROLL_KEYS.has(e.code)) {
    e.preventDefault();
  }

  if (e.repeat && !REPEAT_KEYS.has(e.code)) {
    return;
  }

  key(c, e.code, e.shiftKey, e.key);
}

/** The presenter window can drive the show too. */
function onRigCommand(c: AppContext, e: Event) {
  if (!(e instanceof CustomEvent)) {
    return;
  }

  const k: unknown = e.detail;

  if (typeof k !== "string") {
    return;
  }

  const m = RIG_COMMANDS.get(k);

  if (m) {
    key(c, m[0], m[1], "");
  }
}

export function installKeys(c: AppContext) {
  addEventListener("keydown", (e) => onKeydown(c, e));
  addEventListener("rig-command", (e) => onRigCommand(c, e));
}
