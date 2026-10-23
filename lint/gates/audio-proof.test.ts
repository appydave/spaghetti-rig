// The audio proof harness (N6). It plays every sound effect against a recording engine and a seeded Math.random, and writes down every
// tone, noise, brass and trombone voice the effect asked for, with its start time and every parameter. Two trees that write the same
// log play the same sounds. scripts/audio-proof.mjs runs this file on an old and a new tree and compares what it writes.
//
// It also drives the rest of the engine against a recording AudioContext that logs every node made, every parameter set and every
// connection: the graph setup (init), a deck per track, every step of every track (the instrument voices), the scheduler, and the
// tone, noise, brass and trombone bodies. Those logs are long, so they are written as a hash and an entry count per scenario.
//
// As a normal test it also guards the effects for good: the same seed gives the same log, and no effect is silent.
// AUDIO_PROOF_OUT=<file> writes the log and runs the full 20-seed sweep.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../../src/audio/audio";
import { COMPILED_TRACKS } from "../../src/audio/tracks";

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

const PATH = Symbol("path");
const WORLD = new Map<string, number | string>([
  ["currentTime", 1],
  ["sampleRate", 44100],
  ["state", "running"],
]);

/** Anything an engine method may touch on an AudioContext, recording what it does (log) and handing back more of the same. */
function recorder(log: Arg[][], buffers: Float32Array[][]) {
  const made = new Map<string, number>();
  const name = (what: string): string => {
    const n = made.get(what) ?? 0;

    made.set(what, n + 1);

    return `${what}#${n}`;
  };

  const show = (v: any): Arg =>
    typeof v === "function"
      ? String(v[PATH])
      : typeof v === "object"
        ? JSON.stringify(v)
        : v;
  const node = (
    path: string,
    own?: Record<string, number | ((c: number) => Float32Array)>,
  ): any => {
    const store = new Map<string, Arg>();

    return new Proxy(function () {}, {
      get(_t, p) {
        const key = String(p);

        return p === PATH
          ? path
          : p === Symbol.toPrimitive
            ? () => 1
            : typeof p === "symbol"
              ? undefined
              : own && key in own
                ? own[key]
                : store.has(key)
                  ? store.get(key)
                  : WORLD.has(key)
                    ? WORLD.get(key)
                    : node(`${path}.${key}`);
      },
      set(_t, p, v) {
        log.push([path, String(p), show(v)]);
        store.set(String(p), v);

        return true;
      },
      apply(_t, _this, args) {
        log.push([path, "()", ...args.map(show)]);

        if (path.endsWith(".connect")) {
          return args[0];
        }

        const method = path.slice(path.lastIndexOf(".") + 1);

        if (method === "createBuffer") {
          const [channels, length] = args;
          const data = Array.from(
            { length: channels },
            () => new Float32Array(length),
          );

          buffers.push(data);

          return node(name("buffer"), {
            length,
            getChannelData: (c: number) => data[c],
          });
        }

        return node(
          method.startsWith("create")
            ? name(method.slice(6).toLowerCase())
            : `${path}()`,
        );
      },
      construct: () => node("ctx"),
    });
  };

  return node("ctx");
}

/** One scenario: a fresh engine on a recording context and a seeded Math.random; returns a hash and the entry count of its log. */
function scenario(seed: number, run: (engine: any) => void): [string, number] {
  const log: Arg[][] = [];
  const buffers: Float32Array[][] = [];
  const engine: any = new AudioEngine();
  const root = recorder(log, buffers);

  const random = Math.random;

  Math.random = seeded(seed);
  vi.stubGlobal("setInterval", () => 0);
  vi.stubGlobal("setTimeout", (_fn: () => void, ms: number) =>
    log.push(["setTimeout", ms]),
  );
  vi.stubGlobal("AudioContext", root);
  try {
    engine.init();
    run(engine);
  } finally {
    Math.random = random;
    vi.unstubAllGlobals();
  }

  for (const data of buffers) {
    log.push(["buffer sum", ...data.map((d) => d.reduce((a, b) => a + b, 0))]);
  }

  return [
    createHash("sha1").update(JSON.stringify(log)).digest("hex"),
    log.length,
  ];
}

/** How long apart an effect may be played again, and what the engine does when it is too busy: each is tried just either side of its limit. */
const GAPS: [string, number][] = [
  ["debrisBounce", 0.04],
  ["step", 0.07],
  ["enemyHit", 0.03],
  ["shoot", 0.035],
  ["shootP1", 0.035],
  ["uiMove", 0.03],
  ["glassCrack", 0.04],
  ["enemyPop", 0.03],
  ["damage", 0.08],
  ["bounce", 0.06],
  ["heal", 0.02],
];
const GAP_MARGIN = 0.0003;

const control = (e: any): void => {
  const at = (t: number): void => {
    e.ctx.currentTime = t;
  };

  e.muted = true;
  e.muted = false;
  e.setTheme("walk");

  SFX.forEach((sfx, i) => {
    at(100 + i * 10);
    e.play(sfx, { volume: 0.5, pan: 0.2 });
  });

  GAPS.forEach(([sfx, gap], i) => {
    const start = 1000 + i * 10;

    for (const t of [
      start,
      start + gap - GAP_MARGIN,
      start + gap + GAP_MARGIN,
    ]) {
      at(t);
      e.activeSfx = 0;
      e.play(sfx);
    }
  });

  [
    [24.5, "debrisBounce", "slam"],
    [64.5, "enemyHit", "damage"],
  ].forEach(([busy, low, normal], i) => {
    at(2000 + i * 10);
    e.activeSfx = busy;
    e.play(low);
    e.play(normal);
  });

  const old = e.createDeck(COMPILED_TRACKS[0], 0, 0.03);

  old.stopAt = -2.5;
  at(1);
  e.tick();
  e.tick();

  // A scheduler that is far behind jumps forward; one a hair behind drops the steps it missed.
  const [late, stalled] = [
    e.createDeck(COMPILED_TRACKS[0], 1, 0.03),
    e.createDeck(COMPILED_TRACKS[0], 1, 0.03),
  ];

  e.scheduleDeck(stalled, 1 + COMPILED_TRACKS[0].stepSec * 400, 1000);
  e.scheduleDeck(e.createDeck(COMPILED_TRACKS[0], 1, 0.03), 1.29, 2);
  e.scheduleDeck(late, 1.025, 1.3);
};

const bodies = (e: any): void => {
  const out = e.sfxOut({ volume: 0.7, pan: -0.3 }, 1);

  for (const o of [
    { f: 440, dur: 0.1, vol: 0.2 },
    { f: 440, dur: 0.001, vol: 0.00001 },
    {
      type: "square",
      f: 900,
      f2: 200,
      dur: 0.2,
      vol: 0.3,
      lp: 3000,
      attack: 0.02,
      detune: 7,
      sweep: 0.5,
    },
  ]) {
    e.tone(out, 1, o);
  }

  for (const filter of ["lowpass", "highpass", "bandpass"]) {
    e.noise(out, 1, {
      filter,
      f: 800,
      f2: 300,
      q: 2,
      dur: 0.2,
      vol: 0.2,
      attack: 0.05,
    });
    e.noise(out, 1, { filter, f: 800, dur: 0.1, vol: 0.2 });
  }

  e.noise(out, 1, { filter: "lowpass", f: 500, dur: 1.99, vol: 0.2 });

  // Notes outside what the score uses: a very short one, a very high one, and a pad held long, to reach the voices' floors and ceilings.
  const deck = e.createDeck(COMPILED_TRACKS[0], 1, 0.03);

  for (const voice of ["triangle", "sine", "square", "saw", "pluck"]) {
    e.leadNote(deck, 1, 100, 0.02, 1, voice);
    e.leadNote(deck, 1, 60, 3, 1, voice);
  }

  e.bassNote(deck, 1, 40, 0.02, 1);
  e.bassNote(deck, 1, 40, 4, 1);

  for (const pad of ["warm", "glass", "dark"]) {
    const [first] = COMPILED_TRACKS;
    const held = e.createDeck(
      { ...first, def: { ...first?.def, pad } },
      1,
      0.03,
    );

    e.padChord(held, 1, [60, 64, 67], 5, 1);
  }

  for (const midi of [38, 60, 84]) {
    e.brass(out, 1, midi, 0.8, 0.1);
    e.trombone(out, 1, midi, 0.8, midi > 50);
  }
};

const all: Record<string, Arg[][] | [string, number]> = {};

afterAll(() => {
  if (OUT) {
    writeFileSync(OUT, JSON.stringify(all));
  }
});

const runs: [string, (e: any) => void][] = [
  ["engine bodies", bodies],
  ["engine control", control],
  ...COMPILED_TRACKS.map((track): [string, (e: any) => void] => [
    `track ${track.def.name}`,
    (e: any) => {
      const deck = e.createDeck(track, 1, 0.03);

      e.current = deck;
      e._theme = track.def.theme;
      for (let loop = 0; loop < 2; loop++) {
        for (let idx = 0; idx < track.totalSteps; idx++) {
          e.scheduleStep(deck, idx, loop, 1 + idx * 0.01);
        }
      }

      for (let n = 1; n <= 12; n++) {
        e.scheduleDeck(deck, 1, 1 + track.stepSec * 200 * n);
      }

      // A call that needs more steps than the scheduler's guard allows, on a deck that is not the current one (so it cannot rotate).
      const long = e.createDeck(track, 1, 0.03);

      long.abs = 7;
      e.scheduleDeck(long, 1, 1 + track.stepSec * 300);
      e.retire(long, 2, 1);
      e.retire(deck, 2, 1);
      e.disposeDeck(deck);
    },
  ]),
];

describe("audio proof harness", () => {
  it.each(runs)(
    "%s: played the same way twice, from two seeds",
    (what, run) => {
      for (let seed = 0; seed < Math.min(SEEDS, 2); seed++) {
        const result = scenario(seed, run);

        expect(scenario(seed, run)).toEqual(result);
        expect(result[1]).toBeGreaterThan(0);
        all[`${what} seed ${seed}`] = result;
      }
    },
  );

  it("plays every effect, the same way twice, and none of them silent", () => {
    for (const sfx of SFX) {
      for (let seed = 0; seed < SEEDS; seed++) {
        const calls = record(sfx, seed);

        expect(record(sfx, seed)).toEqual(calls);
        expect(calls.length).toBeGreaterThan(0);
        all[`${sfx} seed ${seed}`] = calls;
      }
    }
  });
});
