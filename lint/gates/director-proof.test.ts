// @vitest-environment happy-dom
// The Director characterisation harness (G04 H2). It plays the real Director against a real DOM (happy-dom, with the real page's markup),
// a fake stage and fake worlds that record every call and hold scripted numbers, a recording audio engine and BroadcastChannel, a seeded
// Math.random and a fixed frame step. After every step and at fixed frames it fingerprints the page (every element, attribute, class
// and text), the calls the Director made, the sounds and broadcasts, and its own state. Two trees that write the same log show the same
// show. scripts/director-proof.mjs runs this file on an old and a new tree and compares; the split of director.ts (D1) must leave it unchanged.
// What it cannot see: layout, the CSS cascade and rendering (happy-dom has none), so a style that only works through a stylesheet is invisible.
// This is the ONLY test file that opts in to a DOM; the default test environment stays node. DIRECTOR_PROOF_OUT=<file> writes the log.
import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Mode } from "../../src/show/script";
import { FakeChannel } from "./director-dom";
import { Show } from "./director-show";
import { logLines } from "./proof-lines";
import { PROOF_TEST_TIMEOUT_MS } from "./proof-timeout";

vi.setConfig({ testTimeout: PROOF_TEST_TIMEOUT_MS });

const OUT = process.env.DIRECTOR_PROOF_OUT;
/** Frames a step is held before the harness moves on (a banner lasts up to 2.6 s and a caption 2.9 s). */
const HOLD_FRAMES = 70;
const LIMIT = 1000;
const MODES: Mode[] = ["p1", "p2", "both", "spec"];
const TIERS = [0, 1, 4, 5];
const LEFT = { x: 400, y: 300 };
const RIGHT = { x: 1200, y: 300 };
const SWINGS = 6;
const SWING_FRAMES = 12;

/** Play one tier through, as a presenter would: let vs and walk steps run on their own, hold the others a moment, then go on. */
function runTier(show: Show, tier: number): void {
  const d = show.director;

  d.startTier(tier);
  show.look("start");
  for (let guard = 0; guard < LIMIT && d.step.tier === tier; guard++) {
    const at = d.at;

    if (["vs", "walk"].includes(d.step.phase)) {
      for (let f = 0; f < LIMIT && d.at === at && d.step.tier === tier; f++) {
        show.frames(1);
      }
    } else {
      show.frames(HOLD_FRAMES);
      show.look(`${d.step.phase}${at}`);

      if (d.step.phase === "ending") {
        break;
      }

      d.next();
    }

    show.look(`after ${at}`);
  }
}

/** Everything a person can do to the show besides letting it run: the chips, the pause, a change of mode, jumping about and going back. */
function controls(show: Show): void {
  const d = show.director;

  d.startTier(0);
  show.frames(HOLD_FRAMES);
  show.look("tier started");
  d.toggleAutoplay();
  d.toggleNotes();
  show.look("autoplay and notes on");
  for (const mode of ["both", "p1", "spec", "p2"] as const) {
    d.setMode(mode);
    show.frames(1);
    show.look(`mode ${mode}`);
  }

  d.setPaused(true);
  show.frames(HOLD_FRAMES);
  show.look("paused");
  d.setPaused(false);
  d.toggleAutoplay();
  d.toggleNotes();
  d.jumpTier(2);
  show.frames(HOLD_FRAMES);
  show.look("jumped to tier 2");
  d.back();
  d.next();
  d.startTier(1);
  show.look(`back, next, tier 1 ${d.hiddenNow()}`);
}

function press(
  x: number,
  y: number,
  init: PointerEventInit = {},
  target: EventTarget = window,
): void {
  target.dispatchEvent(
    new PointerEvent("pointerdown", {
      clientX: x,
      clientY: y,
      button: 0,
      bubbles: true,
      ...init,
    }),
  );
}

/** The mouse: moving over each lane, pressing in each lane, a press that does not count, and leaving the page. */
function pointing(show: Show): void {
  const d = show.director;

  d.startTier(0);
  while (d.step.phase !== "walk") {
    show.frames(1);
  }

  show.frames(HOLD_FRAMES);
  window.dispatchEvent(
    new PointerEvent("pointermove", { clientX: LEFT.x, clientY: LEFT.y }),
  );
  show.frames(1);
  show.look("pointer over the left lane");
  press(LEFT.x, LEFT.y);
  press(RIGHT.x, RIGHT.y);
  show.look("pressed in each lane");
  press(RIGHT.x, RIGHT.y, { button: 2 });
  press(RIGHT.x, RIGHT.y, {}, document.createElement("button"));
  show.look("presses that do not count");
  d.setPaused(true);
  press(LEFT.x, LEFT.y);
  show.look("press while paused");
  document.documentElement.dispatchEvent(new Event("pointerleave"));
  d.setPaused(false);
  show.frames(1);
  show.look("pointer left the page");
}

/** A missed enemy on each side, with the health the worlds are scripted to hold swinging past every threshold. */
function slipping(show: Show): void {
  const d = show.director;

  d.startTier(0);
  while (d.step.phase !== "walk") {
    show.frames(1);
  }

  show.frames(HOLD_FRAMES);
  show.worlds.p1.onSlip?.();
  show.worlds.p2.onSlip?.();
  show.look("a bug on each side");
  for (let i = 0; i < SWINGS; i++) {
    show.frames(SWING_FRAMES);
    show.look(`health swing ${i}`);
  }
}

/** The presenter window talking to the game: asking where it is, and sending a key. */
function talking(show: Show): void {
  show.director.startTier(0);
  show.frames(HOLD_FRAMES);
  FakeChannel.current?.deliver({ type: "hello" });
  show.look("hello");
  FakeChannel.current?.deliver({ type: "cmd", key: "n" });
  show.look("a key");
  show.director.setPaused(true);
  show.look("paused broadcast");
}

/** A presenter tapping through a tier faster than banners and captions finish, with the presenter notes on. */
function tapping(show: Show): void {
  const d = show.director;

  d.toggleNotes();
  d.startTier(0);
  for (
    let guard = 0;
    guard < LIMIT && d.step.tier === 0 && d.step.phase !== "ending";
    guard++
  ) {
    show.frames(1);
    show.look(`tap ${d.step.phase}${d.at}`);
    d.next();
  }
}

type Scenario = [name: string, mode: Mode, run: (s: Show) => void];

const scenarios: Scenario[] = [
  ...MODES.flatMap((mode) =>
    TIERS.map((tier): Scenario => [
      `${mode} plays tier ${tier}`,
      mode,
      (s) => runTier(s, tier),
    ]),
  ),
  ["both uses the controls", "both", controls],
  ["p1 uses the controls", "p1", controls],
  ["both points the mouse", "both", pointing],
  ["spec points the mouse", "spec", pointing],
  ["both misses enemies and swings in health", "both", slipping],
  ["p2 misses enemies and swings in health", "p2", slipping],
  ["both talks to the presenter window", "both", talking],
  ["both taps through tier 0 with notes on", "both", tapping],
  ["p1 taps through tier 0 with notes on", "p1", tapping],
];
const all: Record<string, string[]> = {};

afterAll(() => {
  if (OUT) {
    writeFileSync(OUT, JSON.stringify(all));
  }
});

describe("director proof harness", () => {
  it.each(scenarios.map((s, i) => [...s, i] as const))(
    "%s: plays through and is looked at",
    (name, mode, run, i) => {
      const show = new Show(mode, i);

      try {
        run(show);
      } finally {
        show.close();
      }

      expect(new Set(show.looks).size).toBeGreaterThan(1);
      all[name] = show.looks;
    },
  );

  // The committed log: every fingerprint of every scenario, as the two-tree script compared them (`npx vitest run -u` rewrites it). Skipped when
  // scripts/director-proof.mjs drives this file (OUT): it compares two trees itself, and a changed tree must not fail the harness.
  it.skipIf(OUT)("looks the same as the committed log", async () => {
    await expect(logLines(all)).toMatchFileSnapshot(
      "./__snapshots__/director-proof.txt",
    );
  });
});
