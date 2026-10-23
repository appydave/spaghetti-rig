// The audio proof harness (N6). It plays every sound effect against a recording engine and a seeded Math.random, and writes down every
// tone, noise, brass and trombone voice the effect asked for, with its start time and every parameter. Two trees that write the same
// log play the same sounds. scripts/audio-proof.mjs runs this file on an old and a new tree and compares what it writes.
//
// As a normal test it also guards the effects for good: the same seed gives the same log, and no effect is silent.
// AUDIO_PROOF_OUT=<file> writes the log and runs the full 20-seed sweep.
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AudioEngine } from "../../src/audio/audio";

const OUT = process.env.AUDIO_PROOF_OUT;
const SEEDS = OUT ? 20 : 2;
const START = 1;
const SFX = [
  "shoot",
  "shootP1",
  "enemyHit",
  "enemyPop",
  "robotBreak",
  "slam",
  "damage",
  "glassCrack",
  "shatter",
  "debrisBounce",
  "cardFly",
  "cardPlay",
  "codeFix",
  "heal",
  "gateBanner",
  "bossArrive",
  "bossPartBreak",
  "bounce",
  "bossDefeat",
  "win",
  "lose",
  "vs",
  "uiMove",
  "uiSelect",
  "step",
] as const;

const hole: any = new Proxy(function () {}, {
  get: (_t, p) => (p === Symbol.toPrimitive ? () => 8 : hole),
  apply: () => hole,
  set: () => true,
});

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

type Arg = number | string | Record<string, number | string>;

/** An object with its keys in order, so the order a call happened to list them in cannot show. */
const sorted = (v: Arg): Arg =>
  typeof v === "object"
    ? Object.fromEntries(
        Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
      )
    : v;

function record(sfx: string, seed: number): Arg[][] {
  const calls: Arg[][] = [];
  const engine: any = new AudioEngine();
  const log =
    (kind: string) =>
    (...args: Arg[]) =>
      calls.push([kind, ...args.slice(1).map(sorted)]);

  engine.ctx = hole;
  engine.sfxOut = () => "out";
  engine.tone = log("tone");
  engine.noise = log("noise");
  engine.brass = log("brass");
  engine.trombone = log("trombone");
  engine.cleanup = () => {};

  const real = Math.random;

  Math.random = seeded(seed);
  try {
    engine.playSfx(sfx, START, {});
  } finally {
    Math.random = real;
  }

  return calls;
}

describe("audio proof harness", () => {
  it("plays every effect, the same way twice, and none of them silent", () => {
    const all: Record<string, unknown[]> = {};

    for (const sfx of SFX) {
      for (let seed = 0; seed < SEEDS; seed++) {
        const calls = record(sfx, seed);

        expect(record(sfx, seed)).toEqual(calls);
        expect(calls.length).toBeGreaterThan(0);
        all[`${sfx} seed ${seed}`] = calls;
      }
    }

    if (OUT) {
      writeFileSync(OUT, JSON.stringify(all));
    }
  });
});
