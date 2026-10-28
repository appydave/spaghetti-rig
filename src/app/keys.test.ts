// Pins the keyboard: on every screen, every key still does the action it did when the keys lived inside boot. A recording context stands
// in for the app, so each row reads "this key, in this state -> exactly these calls, in this order".
import { beforeEach, describe, expect, it } from "vitest";
import { press, reset, state } from "#root/lint/gates/recording-app.ts";

beforeEach(reset);

const NOTHING: string[] = [];
const ADVANCE = ["Enter", "Space", "ArrowRight"];

describe("keys on the prelude", () => {
  it("Enter, Space and ArrowRight enter the show", () => {
    state.screen = "prelude";
    for (const code of ADVANCE) {
      expect(press(code)).toEqual(["enter"]);
    }
  });

  it("everything else waits, even mute, help, a mode, Escape or a shifted digit", () => {
    state.screen = "prelude";
    for (const code of ["KeyM", "KeyH", "Digit1", "KeyB", "Escape", "KeyP"]) {
      expect(press(code)).toEqual(NOTHING);
    }

    expect(press("Digit1", true)).toEqual(NOTHING);
    expect(press("Slash", true, "?")).toEqual(NOTHING);
  });
});

describe("keys that work on every screen after the prelude", () => {
  it.each(["title", "map", "game"] as const)("on %s", (screen) => {
    state.screen = screen;
    expect(press("KeyM")).toEqual(["mute"]);
    expect(press("KeyH")).toEqual(["help"]);
    expect(press("Slash", true, "?")).toEqual(["help"]);
    expect(press("Digit1")).toEqual(["setMode:p1"]);
    expect(press("Digit2")).toEqual(["setMode:p2"]);
    expect(press("KeyB")).toEqual(["setMode:both"]);
    expect(press("KeyS")).toEqual(["setMode:spec"]);
    expect(press("KeyM", true)).toEqual(["mute"]);
  });

  it("shift and a digit pick the tier numbered so, else the tier in that position", () => {
    expect(press("Digit1", true)).toEqual(["selected=10", "start:10"]);
    expect(press("Digit2", true)).toEqual(["selected=11", "start:11"]);
    expect(press("Digit7", true)).toEqual(["selected=12", "start:12"]);
    expect(press("Digit3", true)).toEqual(["selected=12", "start:12"]);
    expect(press("Digit4", true)).toEqual(NOTHING);
    expect(press("Digit9", true)).toEqual(NOTHING);
    expect(press("Digit0", true)).toEqual(NOTHING);
  });

  it("the ? character opens the help even where the key code is a screen key", () => {
    state.screen = "game";
    expect(press("KeyP", false, "?")).toEqual(["help"]);
    state.screen = "map";
    expect(press("Enter", false, "?")).toEqual(["help"]);
  });

  it("a digit without shift picks a mode, never a tier", () => {
    expect(press("Digit3")).toEqual(NOTHING);
    expect(press("Digit7")).toEqual(NOTHING);
  });
});

describe("Escape", () => {
  it("closes the help first, on any screen", () => {
    state.help = true;
    for (const screen of ["title", "map", "game"] as const) {
      state.screen = screen;
      expect(press("Escape")).toEqual(["closeHelp"]);
    }
  });

  it("title: nothing; map: back to the title", () => {
    expect(press("Escape")).toEqual(NOTHING);
    state.screen = "map";
    expect(press("Escape")).toEqual(["show:title"]);
  });

  it("game: back to the map, unpausing first when paused", () => {
    state.screen = "game";
    expect(press("Escape")).toEqual(["show:map"]);
    state.paused = true;
    expect(press("Escape")).toEqual(["setPaused:false", "show:map"]);
  });
});

describe("keys on the title", () => {
  it("Enter, Space and ArrowRight open the map", () => {
    for (const code of ADVANCE) {
      expect(press(code)).toEqual(["show:map", "play:uiSelect"]);
    }
  });

  it("other keys do nothing", () => {
    for (const code of ["ArrowLeft", "KeyP", "KeyN", "KeyA", "PageDown"]) {
      expect(press(code)).toEqual(NOTHING);
    }
  });
});

describe("keys on the map", () => {
  beforeEach(() => {
    state.screen = "map";
  });

  it("the arrows move the choice and wrap round the tiers", () => {
    state.selected = 1;
    expect(press("ArrowRight")).toEqual([
      "selected=2",
      "renderMap",
      "play:uiMove",
    ]);
    expect(press("ArrowRight")).toEqual([
      "selected=0",
      "renderMap",
      "play:uiMove",
    ]);
    expect(press("ArrowLeft")).toEqual([
      "selected=2",
      "renderMap",
      "play:uiMove",
    ]);
    expect(press("ArrowLeft")).toEqual([
      "selected=1",
      "renderMap",
      "play:uiMove",
    ]);
  });

  it("Enter and Space start the chosen tier", () => {
    state.selected = 2;
    expect(press("Enter")).toEqual(["start:2"]);
    expect(press("Space")).toEqual(["start:2"]);
  });

  it("game keys do nothing here", () => {
    for (const code of ["KeyP", "KeyN", "KeyA", "PageDown", "PageUp"]) {
      expect(press(code)).toEqual(NOTHING);
    }
  });
});

describe("keys in the game", () => {
  beforeEach(() => {
    state.screen = "game";
  });

  it("running: P pauses, N shows the notes, A toggles autoplay", () => {
    expect(press("KeyP")).toEqual(["pause"]);
    expect(press("KeyN")).toEqual(["notes"]);
    expect(press("KeyA")).toEqual(["auto", "play:uiMove"]);
  });

  it("running: these keys go forward", () => {
    for (const code of ["ArrowRight", "Space", "PageDown", "Enter"]) {
      expect(press(code)).toEqual(["next"]);
    }
  });

  it("running: these keys go back", () => {
    for (const code of ["ArrowLeft", "PageUp"]) {
      expect(press(code)).toEqual(["back"]);
    }
  });

  it("running: other keys do nothing", () => {
    for (const code of ["ArrowUp", "ArrowDown", "KeyX", "Tab"]) {
      expect(press(code)).toEqual(NOTHING);
    }
  });

  it("paused: P, N and A still work", () => {
    state.paused = true;
    expect(press("KeyP")).toEqual(["pause"]);
    expect(press("KeyN")).toEqual(["notes"]);
    expect(press("KeyA")).toEqual(["auto", "play:uiMove"]);
  });

  it("paused: only Space and ArrowRight go on, by unpausing", () => {
    state.paused = true;
    expect(press("Space")).toEqual(["pause"]);
    expect(press("ArrowRight")).toEqual(["pause"]);
    for (const code of ["Enter", "PageDown", "ArrowLeft", "PageUp"]) {
      expect(press(code)).toEqual(NOTHING);
    }
  });
});
