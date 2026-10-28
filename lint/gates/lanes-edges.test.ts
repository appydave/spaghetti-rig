// @vitest-environment happy-dom
// The edges of the lanes, captions and banners that the director-proof log does not reach (D2a): the moment a caption, a banner fade or a
// played card is due, a lane exactly at a width or a pointer exactly on a lane's edge, and a step entered without animation. Each test
// stands just either side of a threshold, so a number moved or changed in the lane code shows here.
import { afterEach, describe, expect, it } from "vitest";
import type { Mode, Phase } from "../../src/show/script";
import type { Lane } from "./director-dom";
import { Show } from "./director-show";

const FRAMES_PER_SECOND = 20;
const LIMIT = 1000;
/** The fake stage is 1600 wide, so player 2's lane in a split starts here. */
const SPLIT_X = 800;
const MID_Y = 450;
const NARROW_BELOW = 1100;

let show: Show;

afterEach(() => show.close());

/** A show in `mode`, stepped (not run) to the first step in `phase`. */
function startAt(mode: Mode, phase: Phase): Show {
  show = new Show(mode, 1);

  const d = show.director;

  d.startTier(0);
  for (let guard = 0; guard < LIMIT && d.step.phase !== phase; guard++) {
    d.next();
  }

  return show;
}

const frames = (seconds: number) =>
  show.frames(Math.round(seconds * FRAMES_PER_SECOND));
const html = (selector: string) =>
  document.querySelector<HTMLElement>(selector);

describe("lane edges", () => {
  it.each([
    ["problem", 2.4],
    ["boss", 2.9],
  ] as const)("a %s caption waits its %s s", (phase, seconds) => {
    startAt("both", phase);
    show.frames(Math.round(seconds * FRAMES_PER_SECOND) - 1);
    expect(html(".lane[data-p='p2'] .caption")?.hidden).toBe(true);
    show.frames(2);
    expect(html(".lane[data-p='p2'] .caption")?.hidden).toBe(false);
  });

  it("the boss banner is gone by 3.1 s, 0.35 s after its 2.6 s (frames land it at 3.05)", () => {
    startAt("both", "boss");
    frames(3);
    expect(html("#banner")?.hidden).toBe(false);
    frames(0.1);
    expect(html("#banner")?.hidden).toBe(true);
  });

  it("a played tool card clears 0.6 s after it is played", () => {
    startAt("both", "tool");
    show.director.next();
    frames(0.55);
    expect(html(".lane[data-p='p2'] .card-slot .tcard")).not.toBeNull();
    frames(0.1);
    expect(html(".lane[data-p='p2'] .card-slot .tcard")).toBeNull();
  });

  it("stepping back onto a fixed step plays no card", () => {
    startAt("both", "fixed");
    show.director.next();
    show.director.back();
    expect(show.director.step.phase).toBe("fixed");
    expect(html(".lane[data-p='p2'] .card-slot .tcard")).toBeNull();
  });

  it("a pointer exactly on player 2's left edge aims in player 2's lane", () => {
    startAt("both", "walk");
    show.log.length = 0;
    window.dispatchEvent(
      new PointerEvent("pointermove", { clientX: SPLIT_X, clientY: MID_Y }),
    );
    show.frames(1);
    expect(show.log).toContainEqual(expect.stringMatching(/^p2\.pointer -1/));
  });

  it.each([
    [NARROW_BELOW - 1, true],
    [NARROW_BELOW, false],
  ])("a lane %s px wide is narrow: %s", (width, narrow) => {
    show = new Show("p1", 1);
    show.stage.lanes = (): Lane[] => [
      { player: "p1", x: 0, y: 0, w: width, h: MID_Y },
    ];
    show.director.setMode("p1");
    expect(html(".lane")?.classList.contains("narrow")).toBe(narrow);
  });
});
