// The model proof harness (R7). It builds every game model headless, with no browser, and fingerprints each one: for every node
// of its scene the world-space vertices, index count, material, light and transform. Two trees that fingerprint the same build
// the same models. The hashes are committed as lint/gates/__snapshots__/model-proof.txt and this file compares against them.
//
// As a normal test it also guards the models for good: they must build the same whatever Math.random says, and the same twice.
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { fingerprint, type Print } from "./model-fingerprint";
import { PROOF_TEST_TIMEOUT_MS } from "./proof-timeout";
import { hole } from "./recording-canvas";
import { seeded } from "./support/seeded";

vi.setConfig({ testTimeout: PROOF_TEST_TIMEOUT_MS });

// The builders only paint label textures on a canvas; a canvas that accepts any drawing call is all they need.
const fakeCanvas = () => ({
  width: 300,
  height: 150,
  getContext: () => hole,
  style: {},
});

(globalThis as any).document = {
  createElement: (tag: string) => (tag === "canvas" ? fakeCanvas() : {}),
};

const { Character } = await import("../../src/world/models/characters");
const { Enemy } = await import("../../src/world/models/enemies");
const { buildCity } = await import("../../src/world/models/city");
const { Gate } = await import("../../src/world/models/gate");
const { BossModel, paintBossPanel } =
  await import("../../src/world/models/boss");
const { bossLayout } = await import("../../src/world/code-window/bosslayout");
const { TitleShowcase, VsShowcase } =
  await import("../../src/world/models/showcase");

/** The full proof builds a few hundred models more than once: well past the default 5 s. */
const TEST_TIMEOUT_MS = 120_000;
// The committed log is the complete proof, so the always-on test runs the complete proof too.
const SEEDS = 50;
const STEP = 1 / 60;
const SAMPLE_TIMES = [0, 0.3, 0.5, 1.0];
const KINDS = ["spaghetti", "bug", "robot"] as const;
const POSES = ["idle", "walk", "hurt", "down", "victory", "aim"] as const;
const GATE_STATES = ["idle", "alarm", "open", "broken"] as const;

/** A built model: its scene, and how to advance its animation by dt seconds. */
type Subject = { root: THREE.Object3D; step: (dt: number) => void };

/** The same Math.random for every build on every tree: a fixed sequence, or one constant. */
type StreamName = "sequence" | "constant";

const STREAMS: Record<StreamName, () => () => number> = {
  sequence: () => seeded(12345),
  constant: () => () => 0.9,
};
const realRandom = Math.random;

function forced<T>(stream: StreamName, fn: () => T): T {
  Math.random = STREAMS[stream]();

  try {
    return fn();
  } finally {
    Math.random = realRandom;
  }
}

const still = (root: THREE.Object3D): Subject => ({ root, step: () => {} });
const from = (x: number, z: number) => new THREE.Vector3(x, 0, z);
const bossOf = (n: number): Subject => {
  const L = bossLayout(n);
  const panel = (aspect: number, header: string) =>
    paintBossPanel({ aspect, header, title: "t" });
  const boss = new BossModel(
    panel(L.core.w / L.core.h, "h"),
    L.parts.map((p, i) => panel(p.w / p.h, `s${i}`)),
  );

  return { root: boss.group, step: (dt) => boss.update(dt) };
};

/** Every named model, animated or not, as a builder; `seed` varies the seeded ones. */
function subjects(seed: number): Map<string, () => Subject> {
  const out = new Map<string, () => Subject>();
  const add = (name: string, make: () => Subject) => out.set(name, make);

  for (const kind of ["p1", "p2"] as const) {
    for (const pose of POSES) {
      add(`character ${kind} ${pose}`, () => {
        const c = new Character(kind);

        c.pose = pose;

        return { root: c.root, step: (dt) => c.update(dt) };
      });
    }
  }

  for (const kind of KINDS) {
    add(`enemy ${kind}`, () => {
      const e = new Enemy(kind, seed, from(5, 0), from(-5, 4), 2.5);
      const facing = new THREE.Vector3(0, 0, 1);

      return { root: e.group, step: (dt) => e.update(dt, facing) };
    });
  }

  for (const state of GATE_STATES) {
    add(`gate ${state}`, () => {
      const g = new Gate("Lint", -34);

      g.state = state;

      return { root: g.group, step: (dt) => g.update(dt) };
    });
  }

  add("city (no plaza)", () => still(buildCity(170, 1000 + seed)));
  add("city (boss plaza)", () =>
    still(buildCity(238, 1077 + seed, { from: 120, to: -60 })),
  );
  add("boss (4 parts)", () => bossOf(4));
  add("boss (6 parts)", () => bossOf(6));
  add("title showcase", () => {
    const s = new TitleShowcase();

    return { root: s.scene, step: (dt) => s.update(dt) };
  });
  add("vs showcase", () => {
    const s = new VsShowcase();

    return { root: s.scene, step: (dt) => s.update(dt) };
  });

  return out;
}

/** Fingerprint one subject at each sample time of its animation, in fixed steps. */
function sample(name: string, make: () => Subject, out: Map<string, Print>) {
  const subject = make();
  let at = 0;

  for (const t of SAMPLE_TIMES) {
    for (; at < t - STEP / 2; at += STEP) {
      subject.step(STEP);
    }

    out.set(`${name} @t=${t}`, fingerprint(subject.root));
  }
}

/** All models under one forced Math.random: the named set, then the seeded sweeps (construction only). */
function runAll(stream: StreamName): Map<string, Print> {
  const out = new Map<string, Print>();
  const sweptNames = [
    ...KINDS.map((k) => `enemy ${k}`),
    "city (no plaza)",
    "city (boss plaza)",
  ];

  forced(stream, () => {
    for (const [name, make] of subjects(7)) {
      sample(name, make, out);
    }

    for (let seed = 1; seed <= SEEDS; seed++) {
      const sweep = subjects(seed);

      for (const name of sweptNames) {
        out.set(
          `${name} seed ${seed}`,
          fingerprint(sweep.get(name)?.().root ?? new THREE.Group()),
        );
      }
    }
  });

  return out;
}

/** The names of the models whose fingerprint differs between two runs. */
const differing = (a: Map<string, Print>, b: Map<string, Print>) =>
  [...a.keys()].filter((k) => a.get(k)?.hash !== b.get(k)?.hash);

describe("model proof harness", () => {
  const results = {
    sequence: runAll("sequence"),
    constant: runAll("constant"),
  };

  it(
    "builds every model, at every sample time and seed",
    () => {
      expect(results.sequence.size).toBeGreaterThan(SEEDS * KINDS.length);
    },
    TEST_TIMEOUT_MS,
  );

  // The committed log: one model per line with its hash. (The sequence and constant streams are asserted equal by the next test.)
  it("builds the same models as the committed log", async () => {
    const lines = [...results.sequence].map(
      ([name, print]) => `${name} | ${print.hash}`,
    );

    await expect(`${lines.join("\n")}\n`).toMatchFileSnapshot(
      "./__snapshots__/model-proof.txt",
    );
  });

  it(
    "builds the same whatever Math.random says",
    () => {
      expect(differing(results.sequence, results.constant)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "builds the same twice",
    () => {
      expect(differing(results.sequence, runAll("sequence"))).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );
});
