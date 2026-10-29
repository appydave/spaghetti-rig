// The recording engines the audio proof harness plays against (N6). Moved out of audio-proof.test.ts: `record` plays one sound effect and
// returns the voices it asked for; `scenario` runs the engine on a recording AudioContext that logs every node made, every parameter set and
// every connection, and returns a hash and an entry count of that log.
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { AudioEngine } from "../../../src/audio/audio";
import { audioParts } from "../../../src/audio/engine/parts";
import { SfxPlayer } from "../../../src/audio/engine/sfx-player";
import { num } from "../world-fingerprint";
import { hole } from "../recording-canvas";
import { PROOF_TEST_TIMEOUT_MS } from "../proof-timeout";
import { seeded } from "./seeded";

// Every audio proof file imports this module, so each one gets the proof timeout: the scenarios play whole tracks.
vi.setConfig({ testTimeout: PROOF_TEST_TIMEOUT_MS });

export type Arg = number | string | Record<string, number | string>;

/** JSON.stringify's replacer: every number is rounded the way the world fingerprint rounds (four decimals), because the synth's maths
 * differs in the last bits between macOS arm64 and Linux x64, and a hash or a committed log must be the same on both. */
type Loggable = Arg | readonly Loggable[];

const stable = (_key: string, v: Loggable) =>
  typeof v === "number" ? Number(num(v)) : v;

const json = (v: Loggable) => JSON.stringify(v, stable);

/** When the sound effects start, in context seconds. */
const START = 1;
const SAMPLE_RATE = 44100;
/** `createGain` names a `gain`: the method name without its `create`. */
const CREATE = "create";

/** An object with its keys in order, so the order a call happened to list them in cannot show. */
const sorted = (v: Arg): Arg =>
  typeof v === "object"
    ? Object.fromEntries(
        Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
      )
    : v;

/** Play one sound effect on an engine whose voices only write down what they are asked, under a seeded Math.random. */
export function record(sfx: string, seed: number): Arg[][] {
  const calls: Arg[][] = [];
  const engine: any = new AudioEngine(audioParts());
  const log =
    (kind: string) =>
    (...args: Arg[]) =>
      calls.push([kind, ...args.slice(1).map((a) => sorted(a))]);

  engine.ctx = hole;
  engine.sfx = new SfxPlayer(hole, hole, null);
  engine.sfx.sfxOut = () => "out";
  engine.sfx.sfxVoices = {
    tone: log("tone"),
    noise: log("noise"),
    brass: (dest: Arg, t: Arg, h: any) =>
      log("brass")(dest, t, h.midi, h.dur, h.vol),
    trombone: (dest: Arg, t: Arg, h: any) =>
      log("trombone")(dest, t, h.midi, h.dur, h.wobble),
  };

  const real = Math.random;

  Math.random = seeded(seed);
  try {
    engine.sfx.playSfx(sfx, START, {});
  } finally {
    Math.random = real;
  }

  return calls;
}

const PATH = Symbol("path");
const WORLD = new Map<string, number | string>([
  ["currentTime", 1],
  ["sampleRate", SAMPLE_RATE],
  ["state", "running"],
]);

type Own = Record<string, number | ((c: number) => Float32Array)>;

/** What the recording context holds: its log, the buffers it made, and how many of each kind of node it has named. */
interface Recording {
  log: Arg[][];
  buffers: Float32Array[][];
  made: Map<string, number>;
}

/** A fresh name for the next node of a kind: gain#0, gain#1, … */
function nameFor(r: Recording, what: string): string {
  const n = r.made.get(what) ?? 0;

  r.made.set(what, n + 1);

  return `${what}#${n}`;
}

const show = (v: any): Arg =>
  typeof v === "function"
    ? String(v[PATH])
    : typeof v === "object"
      ? json(v)
      : v;

/** One recorded node: where it sits in the context, the fields it was made with, and what was set on it. */
interface Recorded {
  path: string;
  own?: Own;
  store: Map<string, Arg>;
}

/** Reading a property of a recorded node: its path, its own fields, what was set on it, the context's world, or a deeper node. */
function read(r: Recording, n: Recorded, p: string | symbol): any {
  const { path, own, store } = n;
  const key = String(p);

  if (p === PATH) {
    return path;
  }

  if (p === Symbol.toPrimitive) {
    return () => 1;
  }

  if (typeof p === "symbol") {
    return undefined;
  }

  if (own && key in own) {
    return own[key];
  }

  if (store.has(key)) {
    return store.get(key);
  }

  return WORLD.has(key) ? WORLD.get(key) : node(r, `${path}.${key}`);
}

/** Calling a recorded node: connect hands back its target, createBuffer makes real channel data, create* names a new node. */
function call(r: Recording, path: string, args: any[]): any {
  r.log.push([path, "()", ...args.map((a) => show(a))]);

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

    r.buffers.push(data);

    return node(r, nameFor(r, "buffer"), {
      length,
      getChannelData: (c: number) => data[c],
    });
  }

  return node(
    r,
    method.startsWith(CREATE)
      ? nameFor(r, method.slice(CREATE.length).toLowerCase())
      : `${path}()`,
  );
}

/** Anything an engine method may touch on an AudioContext, recording what it does and handing back more of the same. */
function node(r: Recording, path: string, own?: Own): any {
  const n: Recorded = { path, own, store: new Map<string, Arg>() };

  return new Proxy(
    function () {
      // A callable target, so the engine can call any node it holds.
    },
    {
      get: (_t, p) => read(r, n, p),
      set(_t, p, v) {
        r.log.push([path, String(p), show(v)]);
        n.store.set(String(p), v);

        return true;
      },
      apply: (_t, _this, args) => call(r, path, args),
      construct: () => node(r, "ctx"),
    },
  );
}

/** One scenario: a fresh engine on a recording context and a seeded Math.random; returns a hash and the entry count of its log. */
function scenario(seed: number, run: (engine: any) => void): [string, number] {
  const r: Recording = { log: [], buffers: [], made: new Map() };
  const { log } = r;
  const engine: any = new AudioEngine(audioParts());
  const root = node(r, "ctx");

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

  for (const data of r.buffers) {
    log.push(["buffer sum", ...data.map((d) => d.reduce((a, b) => a + b, 0))]);
  }

  return [createHash("sha1").update(json(log)).digest("hex"), log.length];
}

/** Every sound effect the game can play, by name. */
export const SFX = [
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

/** How many seeds each scenario is played from (each one twice). */
const SCENARIO_SEEDS = 2;

/** What a proof file collects, by run name: an effect's voice log, or a scenario's hash and entry count. */
export type Runs = Record<string, Arg[][] | [string, number]>;

/** Register one test per scenario: it is played the same way twice, from each of two seeds, and its log is collected under its name. */
export function playsTwice(runs: [string, (e: any) => void][], all: Runs) {
  it.each(runs)(
    "%s: played the same way twice, from two seeds",
    (what, run) => {
      for (let seed = 0; seed < SCENARIO_SEEDS; seed++) {
        const result = scenario(seed, run);

        expect(scenario(seed, run)).toEqual(result);
        expect(result[1]).toBeGreaterThan(0);
        all[`${what} seed ${seed}`] = result;
      }
    },
  );
}

/** Register the test that holds what the file collected against its committed log, one run per line, so a changed voice shows as a changed line. */
export function matchesCommittedLog(all: Runs, path: string) {
  it("plays the same voices as the committed log", async () => {
    const lines = Object.entries(all).map(
      ([run, voices]) => `${JSON.stringify(run)}: ${json(voices)}`,
    );

    await expect(`{\n${lines.join(",\n")}\n}\n`).toMatchFileSnapshot(path);
  });
}
