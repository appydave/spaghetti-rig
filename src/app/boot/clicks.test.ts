// Pins the page's buttons: each data-action does what it did when the click handler lived inside boot.
import { beforeEach, describe, expect, it } from "vitest";
import { clickAction } from "#root/src/app/boot/clicks.ts";
import { ctx, log, reset, state } from "#root/lint/gates/recording-app.ts";

beforeEach(reset);

/** Click `act` and return the calls it made. */
function click(act: string | undefined) {
  log.length = 0;
  clickAction(ctx, act);

  return [...log];
}

describe("the data-action buttons", () => {
  it("mute, help and autoplay", () => {
    expect(click("mute")).toEqual(["mute"]);
    expect(click("help")).toEqual(["help"]);
    expect(click("auto")).toEqual(["auto", "play:uiMove"]);
  });

  it("pause pauses; with the help open it shuts the help first", () => {
    expect(click("pause")).toEqual(["pause"]);
    state.help = true;
    expect(click("pause")).toEqual(["closeHelp", "pause"]);
  });

  it("to-map un-pauses and goes to the map", () => {
    expect(click("to-map")).toEqual(["setPaused:false", "show:map"]);
  });

  it("a name nobody knows, or none, does nothing", () => {
    expect(click("fly")).toEqual([]);
    expect(click(undefined)).toEqual([]);
  });
});
