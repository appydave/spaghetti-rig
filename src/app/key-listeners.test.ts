// @vitest-environment happy-dom
// The listeners that feed the keys: which key presses the page must not scroll with, which repeat while held, and the presenter's commands.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installKeys } from "#root/src/app/keys.ts";
import { ctx, log, reset, state } from "#root/lint/gates/recording-app.ts";

const NOTHING: string[] = [];

describe("the listeners", () => {
  beforeAll(() => installKeys(ctx));

  beforeEach(() => {
    reset();
    state.screen = "game";
  });

  /** Fire a keydown at the window; returns whether the page's own handling was cancelled. */
  function keydown(init: KeyboardEventInit) {
    const e = new KeyboardEvent("keydown", { cancelable: true, ...init });

    log.length = 0;
    dispatchEvent(e);

    return e.defaultPrevented;
  }

  it("a key press reaches the keys, with shift and the character", () => {
    keydown({ code: "ArrowRight" });
    expect(log).toEqual(["next"]);
    keydown({ code: "Digit1", shiftKey: true });
    expect(log).toEqual(["selected=10", "start:10"]);
    keydown({ code: "Slash", key: "?" });
    expect(log).toEqual(["help"]);
  });

  it("scrolling keys are cancelled, other keys are not", () => {
    for (const code of [
      "Space",
      "ArrowRight",
      "ArrowLeft",
      "ArrowUp",
      "ArrowDown",
      "PageDown",
      "PageUp",
    ]) {
      expect(keydown({ code })).toBe(true);
    }

    for (const code of ["KeyP", "Enter", "KeyM", "Escape"]) {
      expect(keydown({ code })).toBe(false);
    }
  });

  it("a held key repeats only for ArrowRight and ArrowLeft", () => {
    keydown({ code: "ArrowRight", repeat: true });
    expect(log).toEqual(["next"]);
    keydown({ code: "ArrowLeft", repeat: true });
    expect(log).toEqual(["back"]);
    expect(keydown({ code: "Space", repeat: true })).toBe(true);
    expect(log).toEqual(NOTHING);
    keydown({ code: "KeyP", repeat: true });
    expect(log).toEqual(NOTHING);
  });

  it("a key with ctrl, meta or alt held is left to the browser", () => {
    for (const mod of ["ctrlKey", "metaKey", "altKey"]) {
      expect(keydown({ code: "ArrowRight", [mod]: true })).toBe(false);
      expect(log).toEqual(NOTHING);
    }
  });

  it("the presenter's commands press the matching keys", () => {
    const sent = (detail: string) => {
      log.length = 0;
      dispatchEvent(new CustomEvent("rig-command", { detail }));

      return [...log];
    };

    expect(sent("next")).toEqual(["next"]);
    expect(sent("back")).toEqual(["back"]);
    expect(sent("pause")).toEqual(["pause"]);
    expect(sent("p1")).toEqual(["setMode:p1"]);
    expect(sent("p2")).toEqual(["setMode:p2"]);
    expect(sent("both")).toEqual(["setMode:both"]);
    expect(sent("spec")).toEqual(["setMode:spec"]);
    expect(sent("auto")).toEqual(["auto", "play:uiMove"]);
  });

  it("anything else from the presenter is ignored", () => {
    for (const detail of ["jump", "", "NEXT", "next "]) {
      log.length = 0;
      dispatchEvent(new CustomEvent("rig-command", { detail }));
      expect(log).toEqual(NOTHING);
    }

    dispatchEvent(new Event("rig-command"));
    expect(log).toEqual(NOTHING);
  });
});
