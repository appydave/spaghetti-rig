// @vitest-environment happy-dom
// The edges of the render, step and frame code that the director-proof log does not reach (D2b): how long the gate banner stays, a step
// entered without animation, the cue and the face-off timers at the moment they are due, and the pointer press over an overlay. Each test
// stands just either side of a threshold, so a number or a guard changed in view.ts, frame.ts or input.ts shows here.
import { afterEach, describe, expect, it } from "vitest";
import type { Mode, Phase } from "../../src/show/script";
import { FRAME, Show } from "./director-show";
import { framesFor, stepTo as stepToPhase } from "./support/show-steps";

const VS_SECONDS = 4.2;

let show: Show;

afterEach(() => show.close());

const begin = (mode: Mode): Show => {
  show = new Show(mode, 1);

  return show;
};

const frames = (seconds: number) => framesFor(show, seconds);
const stepTo = (phase: Phase) => stepToPhase(show, phase);
const banner = () => document.querySelector<HTMLElement>("#banner");
const bossBar = () =>
  document.querySelector<HTMLElement>(".lane[data-p='p2'] .bossbar");

describe("render edges", () => {
  it("the gate banner stays 1.45 s and then fades for 0.35 s", () => {
    begin("both");
    stepTo("problem");
    frames(1.5);
    expect(banner()?.hidden).toBe(false);
    frames(0.4);
    expect(banner()?.hidden).toBe(true);
  });

  it.each(["problem", "boss"] as const)(
    "a %s step entered without animation shows no banner",
    (phase) => {
      begin("both");
      stepTo(phase);
      show.director.go(show.director.at, false);
      expect(banner()?.hidden).toBe(true);
    },
  );

  it("a step entered without animation still snaps the camera inside a tier", () => {
    begin("both");
    stepTo("problem");
    show.log.length = 0;
    show.director.go(show.director.at, false);
    expect(show.log).toContain("p1.snapCamera");
  });

  it("the score reported is the higher of the two", () => {
    begin("both");
    show.worlds.p1.score = 5;
    show.worlds.p2.score = 9;
    show.director.onScore = (n) => show.log.push(`score ${n}`);
    stepTo("result");
    expect(show.log).toContain("score 9");
  });

  it("the boss bar stays hidden outside the boss steps", () => {
    begin("both");
    stepTo("problem");
    show.worlds.p2.bossTotal = 3;
    show.director.update(FRAME);
    expect(bossBar()?.hidden).toBe(true);
  });
});

describe("frame edges", () => {
  it("a cue due this frame fires this frame, and once", () => {
    begin("both");

    let fired = 0;

    show.director.run.cues.push({ at: FRAME, fn: () => fired++ });
    show.frames(1);
    expect(fired).toBe(1);
    show.frames(5);
    expect(fired).toBe(1);
  });

  it("switching to spec mode puts player 1 on autoplay", () => {
    begin("both");
    show.director.setMode("spec");
    expect(show.worlds.p1.autoplay).toBe(true);
  });

  it("a face-off timer exactly at 4.2 s has not run out", () => {
    begin("both");
    stepTo("vs");

    const at = show.director.at;

    show.director.run.vsT = VS_SECONDS;
    show.director.update(0);
    expect(show.director.at).toBe(at);
  });

  it("leaving the face-off screen early stops its timer", () => {
    begin("both");
    stepTo("vs");
    frames(1);

    const d = show.director;
    const away = d.script.findIndex((s) => s.phase === "problem");

    d.go(away, true);
    frames(VS_SECONDS);
    expect(d.at).toBe(away);
  });
});

describe("input edges", () => {
  it("a press over an overlay does not aim", () => {
    begin("both");
    stepTo("problem");
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div class="overlay"><i id="inside"></i></div>',
    );
    document
      .querySelector("#inside")
      ?.dispatchEvent(
        new PointerEvent("pointerdown", { button: 0, bubbles: true }),
      );
    expect(show.director.run.pointer).toBeNull();
  });
});
