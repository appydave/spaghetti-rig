// The world characterisation harness (G04 H1). It plays PlayerWorld through the whole script, headless, against a seeded Math.random,
// a fake clock (fixed frame steps), a recording audio engine and a stubbed canvas, and writes down what the world looks like and
// holds after every step and at fixed frames inside it: its scene graph (every node's transform, visibility and material), its state
// (health, score, camera, gates, enemies, boss, window), and the sounds it asked for. Two trees that write the same log play the same
// game. scripts/world-proof.mjs runs this file on an old and a new tree and compares what it writes; the split of world.ts (W1-W6)
// must leave it unchanged. A scenario is one it(): a player, a tier, and how the world is played (watching, autoplay, the pointer).
// Repeating itself across processes is checked by the script (a first run warms module-level caches, so a second run in the same process
// draws differently by design); as a normal test it checks each scenario really plays: a log of several distinct looks.
// WORLD_PROOF_OUT=<file> writes the log.
import { readFileSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import type { Step } from "../../src/show/script";
import { spyOnTemps } from "./disposal-spy";
import { makeCanvas } from "./recording-canvas";
import { scenarioList, type Mode, type Scenario } from "./world-scenarios";
import { num, sceneOf, sha, stateOf } from "./world-fingerprint";
import { afterAll, describe, expect, it, vi } from "vitest";
import { logLines } from "./proof-lines";
import { PROOF_TEST_TIMEOUT_MS } from "./proof-timeout";

vi.setConfig({ testTimeout: PROOF_TEST_TIMEOUT_MS });

(globalThis as any).document = {
  createElement: (tag: string) => (tag === "canvas" ? makeCanvas() : {}),
};

const { parseContent } = await import("../../src/content/load");
const { buildScript } = await import("../../src/show/script");
const { PlayerWorld, walkSeconds } = await import("../../src/world/world");
const { initPhysics } = await import("../../src/world/physics");

await initPhysics();

const OUT = process.env.WORLD_PROOF_OUT;
const FRAME = 1 / 20;
/** Frames played inside a step before the world is looked at again, per kind of step (a walk takes about nine seconds). */
const WALK_FRAMES = 190;
const STEP_FRAMES = 70;
/** The frames at which the world is fingerprinted inside a step. */
const SAMPLES = [0, 5, 20, 45, 69, 130, 189];
const PAN = 0.25;
const WIDE = 16 / 9;
const TALL = 9 / 16;
const WIDER_TALL = 1.2;
const POINTER_EVERY = 6;
const POINTER_LEAVES_EVERY = 4;
const SKIP_FRAMES = 3;

type Arg = number | string | boolean | null;

const game = parseContent(
  JSON.parse(
    readFileSync(
      new URL("../../public/content/cards.json", import.meta.url),
      "utf8",
    ),
  ),
);
const script = buildScript(game);

/** A small repeatable random number generator (mulberry32). */
function seeded(seed: number): () => number {
  let s = seed;

  return () => {
    s = (s + 0x6d2b79f5) | 0;

    let t = Math.imul(s ^ (s >>> 15), 1 | s);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What a scenario plays with: the world, how it is played, and how it is looked at. */
type Run = {
  w: any;
  mode: Mode;
  look: (label: string) => void;
  /** What the world told its caller since the last look: the enemies that slipped, what the pointer returned. */
  events: string[];
};

/** Play one step as the Director does: enter it (or settle on it, when jumping about) and run its frames, looking at fixed ones. */
function playStep(run: Run, step: Step, first: boolean, linger?: number): void {
  const { w, mode, look, events } = run;

  // A tour settles on each step, as jumping about does, but leaves it after a moment, as skipping through does.
  const settles = mode === "jump" || mode === "tour";
  const leaves = mode === "skip" || mode === "tour";

  if (settles && step.phase !== "walk") {
    w.settle(step);
  } else {
    w.enter(step);
  }

  if (first || settles) {
    w.snapCamera();
    // Looked at straight away: the scenery that follows the camera must already be right, before any frame runs.
    look(`snap ${step.phase}${step.stop}.${step.part}`);
  }

  // A skipping presenter leaves each step after a moment, with its tweens and cues still running.
  const frames =
    linger ??
    (leaves ? SKIP_FRAMES : step.phase === "walk" ? WALK_FRAMES : STEP_FRAMES);
  let walkT = 0;

  for (let f = 0; f < frames; f++) {
    if (step.phase === "walk") {
      // The Director drives the walk, so both players stay in step: u runs 0 to 1 over the walk.
      walkT += FRAME;
      w.setWalk(Math.min(1, walkT / walkSeconds()));
    }

    if (mode === "pointer" && f % POINTER_EVERY === 0) {
      events.push(
        `hit:${w.pointer(
          w.enemyScreen() ?? new THREE.Vector2(((f % 5) - 2) / 4, 0.1),
          true,
        )}`,
      );
      // The pointer leaves the window now and then.
      if (f % (POINTER_EVERY * POINTER_LEAVES_EVERY) === 0) {
        events.push(`left:${w.pointer(null, false)}`);
      }
    }

    w.update(FRAME);
    if (SAMPLES.includes(f) || (leaves && f === frames - 1)) {
      look(`${step.phase}${step.stop}.${step.part} f${f}`);
    }
  }
}

const RESIZE_EVERY = 3;

/** The steps of the tiers to visit, in order; with andBack, each tier is paged back through once forward; with cutAt, the first tier stops short. */
function stepsToPlay(
  visit: number[],
  andBack: boolean,
  cutAt?: number,
): Step[] {
  return visit.flatMap((t, i) => {
    const steps = script.filter((s) => s.tier === t);

    if (i === 0 && cutAt !== undefined) {
      return steps.slice(0, cutAt);
    }

    return andBack ? [...steps, ...steps.slice(0, -1).reverse()] : steps;
  });
}

/** Resize the world's window: "flip" between wide and tall, "same" between two talls. */
function resizeWorld(w: any, resize: "flip" | "same"): void {
  w.setAspect(
    resize === "flip"
      ? w.aspect === WIDE
        ? TALL
        : WIDE
      : w.aspect === TALL
        ? WIDER_TALL
        : TALL,
  );
}

/** One scenario: play a player through one tier and return a hash per look at the world. */
function play({
  player,
  tier,
  mode,
  seed,
  tall = false,
  resize,
  visit = [tier],
  andBack = false,
  cutAt,
  lingerFrames,
}: Scenario): string[] {
  const sounds: Arg[][] = [];
  const audio: any = {
    play: (name: string, o: { pan?: number; volume?: number }) =>
      sounds.push([name, num(o.volume ?? 1), num(o.pan ?? 0)]),
  };
  const real = Math.random;

  Math.random = seeded(seed);

  try {
    const w: any = new PlayerWorld(player, game, audio, () => PAN);
    const log: string[] = [];
    const events: string[] = [];
    const temps = spyOnTemps(w);
    const look = (label: string): void => {
      events.push(temps());
      if (resize && log.length % RESIZE_EVERY === RESIZE_EVERY - 1) {
        resizeWorld(w, resize);
      }

      log.push(
        `${label} ${sha(`${sceneOf(w.scene)}#${stateOf(w)}#${JSON.stringify(sounds.splice(0))}#${events.splice(0).join()}`)}`,
      );
    };

    w.setAspect(tall ? TALL : WIDE);
    w.autoplay = mode === "autoplay" || lingerFrames !== undefined;
    w.onSlip = (kind: string) => events.push(`slip:${kind}`);
    for (const [i, step] of stepsToPlay(visit, andBack, cutAt).entries()) {
      playStep(
        { w, mode, look, events },
        step,
        i === 0,
        i === (cutAt ?? 0) - 1 ? lingerFrames : undefined,
      );
    }

    return log;
  } finally {
    Math.random = real;
  }
}

const SCENARIOS = scenarioList(game.tiers, play);
const all: Record<string, string[]> = {};

describe("the fingerprint sees a vertex edited in place", () => {
  it("a vertex that is not a probe, edited and flagged for upload, changes the scene's fingerprint", () => {
    const VERTICES = 287;
    const EDITED = 18;
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(VERTICES * 3), 3),
    );

    const scene = new THREE.Scene();

    scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));

    const before = sha(sceneOf(scene));

    expect(sha(sceneOf(scene))).toBe(before);
    geometry.attributes.position?.setX(EDITED, 1);
    geometry.attributes.position!.needsUpdate = true;
    expect(sha(sceneOf(scene))).not.toBe(before);
  });
});

afterAll(() => {
  if (OUT) {
    writeFileSync(OUT, JSON.stringify(all));
  }
});

describe("world proof harness", () => {
  it.each(SCENARIOS)("%s: plays through and is looked at", (name, run) => {
    const log = run();

    expect(log.length).toBeGreaterThan(0);
    expect(new Set(log).size).toBeGreaterThan(1);
    all[name] = log;
  });

  // The committed log: every fingerprint of every scenario, as the two-tree script compared them (`npx vitest run -u` rewrites it). Skipped when
  // scripts/world-proof.mjs drives this file (OUT): it compares two trees itself, and a changed tree must not fail the harness.
  it.skipIf(OUT)("looks the same as the committed log", async () => {
    await expect(logLines(all)).toMatchFileSnapshot(
      "./__snapshots__/world-proof.txt",
    );
  });
});
