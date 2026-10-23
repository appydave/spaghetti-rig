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
import { num, sceneOf, sha, stateOf } from "./world-fingerprint";
import { afterAll, describe, expect, it } from "vitest";

// The builders paint label textures on a canvas; a canvas that accepts any drawing call is all they need.
const hole: any = new Proxy(function () {}, {
  get: (_t, p) => (p === Symbol.toPrimitive ? () => 8 : hole),
  apply: () => hole,
  set: () => true,
});

(globalThis as any).document = {
  createElement: (tag: string) =>
    tag === "canvas"
      ? { width: 300, height: 150, getContext: () => hole, style: {} }
      : {},
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
const POINTER_EVERY = 6;
const SKIP_FRAMES = 3;

type Mode = "watch" | "autoplay" | "pointer" | "jump" | "skip";
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
type Run = { w: any; mode: Mode; look: (label: string) => void };
type Scenario = {
  player: "p1" | "p2";
  tier: number;
  mode: Mode;
  seed: number;
  tall?: boolean;
  /** Flip the window between wide and tall at every third look, so the resize lands mid-step with a window and a boss up. */
  resize?: boolean;
};

/** Play one step as the Director does: enter it (or settle on it, when jumping about) and run its frames, looking at fixed ones. */
function playStep(run: Run, step: Step, first: boolean): void {
  const { w, mode, look } = run;

  if (mode === "jump" && step.phase !== "walk") {
    w.settle(step);
  } else {
    w.enter(step);
  }

  if (first || mode === "jump") {
    w.snapCamera();
  }

  // A skipping presenter leaves each step after a moment, with its tweens and cues still running.
  const frames =
    mode === "skip"
      ? SKIP_FRAMES
      : step.phase === "walk"
        ? WALK_FRAMES
        : STEP_FRAMES;
  let walkT = 0;

  for (let f = 0; f < frames; f++) {
    if (step.phase === "walk") {
      // The Director drives the walk, so both players stay in step: u runs 0 to 1 over the walk.
      walkT += FRAME;
      w.setWalk(Math.min(1, walkT / walkSeconds()));
    }

    if (mode === "pointer" && f % POINTER_EVERY === 0) {
      w.pointer(
        w.enemyScreen() ?? new THREE.Vector2(((f % 5) - 2) / 4, 0.1),
        true,
      );
    }

    w.update(FRAME);
    if (SAMPLES.includes(f) || (mode === "skip" && f === SKIP_FRAMES - 1)) {
      look(`${step.phase}${step.stop}.${step.part} f${f}`);
    }
  }
}

const RESIZE_EVERY = 3;

/** One scenario: play a player through one tier and return a hash per look at the world. */
function play({
  player,
  tier,
  mode,
  seed,
  tall = false,
  resize = false,
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
    const look = (label: string): void => {
      if (resize && log.length % RESIZE_EVERY === RESIZE_EVERY - 1) {
        w.setAspect(w.aspect === WIDE ? TALL : WIDE);
      }

      log.push(
        `${label} ${sha(`${sceneOf(w.scene)}#${stateOf(w)}#${JSON.stringify(sounds.splice(0))}`)}`,
      );
    };

    w.setAspect(tall ? TALL : WIDE);
    w.autoplay = mode === "autoplay";
    for (const [i, step] of script.filter((s) => s.tier === tier).entries()) {
      playStep({ w, mode, look }, step, i === 0);
    }

    return log;
  } finally {
    Math.random = real;
  }
}

const named = (what: string, s: Scenario): [string, () => string[]] => [
  `${s.player} ${what}, tier ${s.tier}`,
  () => play(s),
];
const SCENARIOS: [string, () => string[]][] = game.tiers.flatMap((t) =>
  (["p1", "p2"] as const).flatMap((player): [string, () => string[]][] => [
    named("watches", { player, tier: t.index, mode: "watch", seed: t.index }),
    ...(t.index <= 1
      ? [
          named("on autoplay", {
            player,
            tier: t.index,
            mode: "autoplay",
            seed: t.index + 10,
          }),
          named("clicks with the pointer", {
            player,
            tier: t.index,
            mode: "pointer",
            seed: t.index + 20,
          }),
          named("jumps about", {
            player,
            tier: t.index,
            mode: "jump",
            seed: t.index + 30,
          }),
          named("skips through", {
            player,
            tier: t.index,
            mode: "skip",
            seed: t.index + 40,
          }),
        ]
      : []),
  ]),
);

SCENARIOS.push(
  ...game.tiers.map((t) =>
    named("resizes mid-play", {
      player: "p1",
      tier: t.index,
      mode: "watch",
      seed: t.index + 50,
      resize: true,
    }),
  ),
  named("on a tall screen", {
    player: "p2",
    tier: 0,
    mode: "watch",
    seed: 7,
    tall: true,
  }),
);

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
});
