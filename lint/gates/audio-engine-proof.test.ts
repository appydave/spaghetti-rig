// The audio engine proof (N6), split out of audio-proof.test.ts: it drives the engine against a recording AudioContext that logs every
// node made, every parameter set and every connection: the graph setup (init), the scheduler and its edges, the engine's public surface,
// and the tone, noise, brass, trombone and instrument bodies at their floors and ceilings. Those logs are long, so each scenario is
// written as a hash and an entry count, committed as lint/gates/__snapshots__/audio-engine-proof.json (`npx vitest run -u` rewrites it).
// The sound effects and the tracks are in audio-proof.test.ts.
import { describe, expect, vi } from "vitest";
import { AudioEngine } from "../../src/audio/audio";
import { audioParts } from "../../src/audio/engine/parts";
import { scheduleDeck } from "../../src/audio/music/sequencer";
import { COMPILED_TRACKS } from "../../src/audio/tracks";
import {
  matchesCommittedLog,
  playsTwice,
  SFX,
  type Runs,
} from "./support/audio-recorder";

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

/** Every effect once, then each rate-limited effect just either side of its gap, then the low-priority ones on a busy engine. */
const controlSfx = (e: any, at: (t: number) => void): void => {
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
      e.sfx.activeSfx = 0;
      e.play(sfx);
    }
  });

  [
    [24.5, "debrisBounce", "slam"],
    [64.5, "enemyHit", "damage"],
  ].forEach(([busy, low, normal], i) => {
    at(2000 + i * 10);
    e.sfx.activeSfx = busy;
    e.play(low);
    e.play(normal);
  });
};

/** The music scheduler: a deck that has stopped, then one far behind that jumps forward and one a hair behind that drops the steps it missed. */
const controlMusic = (e: any, at: (t: number) => void): void => {
  const old = e.music.createDeck(COMPILED_TRACKS[0], 0, 0.03);

  old.stopAt = -2.5;
  at(1);
  e.music.tick();
  e.music.tick();

  // A scheduler that is far behind jumps forward; one a hair behind drops the steps it missed.
  const [late, stalled] = [
    e.music.createDeck(COMPILED_TRACKS[0], 1, 0.03),
    e.music.createDeck(COMPILED_TRACKS[0], 1, 0.03),
  ];

  scheduleDeck(
    stalled,
    1 + COMPILED_TRACKS[0].stepSec * 400,
    1000,
    e.music.sequencer,
  );
  scheduleDeck(
    e.music.createDeck(COMPILED_TRACKS[0], 1, 0.03),
    1.29,
    2,
    e.music.sequencer,
  );
  scheduleDeck(late, 1.025, 1.3, e.music.sequencer);
};

const control = (e: any): void => {
  const at = (t: number): void => {
    e.ctx.currentTime = t;
  };

  e.muted = true;
  e.muted = false;
  e.setTheme("walk");
  controlSfx(e, at);
  controlMusic(e, at);
};

/** The sound effects' tone and noise bodies at their edges. */
const toneBodies = (e: any, out: any): void => {
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
    e.sfx.sfxVoices.tone(out, 1, o);
  }

  for (const filter of ["lowpass", "highpass", "bandpass"]) {
    e.sfx.sfxVoices.noise(out, 1, {
      filter,
      f: 800,
      f2: 300,
      q: 2,
      dur: 0.2,
      vol: 0.2,
      attack: 0.05,
    });
    e.sfx.sfxVoices.noise(out, 1, { filter, f: 800, dur: 0.1, vol: 0.2 });
  }

  e.sfx.sfxVoices.noise(out, 1, {
    filter: "lowpass",
    f: 500,
    dur: 1.99,
    vol: 0.2,
  });
};

/** Brass and trombone, low, middle and high. */
const hornBodies = (e: any, out: any): void => {
  for (const midi of [38, 60, 84]) {
    e.sfx.sfxVoices.brass(out, 1, { midi, dur: 0.8, vol: 0.1 });
    e.sfx.sfxVoices.trombone(out, 1, { midi, dur: 0.8, wobble: midi > 50 });
  }
};

/** The music voices at their floors and ceilings. */
const musicBodies = (e: any): void => {
  // Notes outside what the score uses: a very short one, a very high one, and a pad held long, to reach the voices' floors and ceilings.
  const deck = e.music.createDeck(COMPILED_TRACKS[0], 1, 0.03);

  for (const voice of ["triangle", "sine", "square", "saw", "pluck"]) {
    e.music.sequencer.voices.leadNote(
      { deck, t: 1, level: 1 },
      100,
      0.02,
      voice,
    );
    e.music.sequencer.voices.leadNote({ deck, t: 1, level: 1 }, 60, 3, voice);
  }

  e.music.sequencer.voices.bassNote({ deck, t: 1, level: 1 }, 40, 0.02);
  e.music.sequencer.voices.bassNote({ deck, t: 1, level: 1 }, 40, 4);

  for (const pad of ["warm", "glass", "dark"]) {
    const [first] = COMPILED_TRACKS;
    const held = e.music.createDeck(
      { ...first, def: { ...first?.def, pad } },
      1,
      0.03,
    );

    e.music.sequencer.voices.padChord(
      { deck: held, t: 1, level: 1 },
      [60, 64, 67],
      5,
    );
  }
};

const bodies = (e: any): void => {
  const out = e.sfx.sfxOut({ volume: 0.7, pan: -0.3 }, 1);

  toneBodies(e, out);
  musicBodies(e);
  hornBodies(e, out);
};

/** The scheduler's edges: a step a hair late still sounds, at the clock's time; a tick schedules a live deck; a deck that has played its loops hands over to the theme's next track, and the change shows in the log as a timer as long as the new name. */
const seams = (e: any): void => {
  scheduleDeck(
    e.music.createDeck(COMPILED_TRACKS[0], 1, 0.03),
    1.01,
    1.3,
    e.music.sequencer,
  );
  e.onTrackChange((name: string) => setTimeout(() => undefined, name.length));
  e.music.createDeck(COMPILED_TRACKS[0], 1.2, 0.03);

  const [first] = COMPILED_TRACKS.filter(
    (t) =>
      COMPILED_TRACKS.filter((o) => o.def.theme === t.def.theme).length > 1,
  );
  const deck = e.music.createDeck(first, 1, 0.03);

  e.music.current = deck;
  e.music.theme = first?.def.theme;
  deck.abs = (first?.def.loops ?? 0) * (first?.totalSteps ?? 0);
  deck.start = 1 - deck.abs * (first?.stepSec ?? 0);
  e.music.tick();
};

/** The engine's public surface: a theme set twice and then silenced, a paused unlock, a suspended context, mute and pause around a play, an out-of-range pan and volume, a busy engine, one paused and muted before it starts, a browser with only the prefixed context, and one whose context cannot be made. */
const surface = (e: any): void => {
  const stateIs = (state: string): void => {
    e.ctx.state = state;
  };

  e.onTrackChange((name: string) => setTimeout(() => undefined, name.length));
  e.setTheme("walk");
  e.setTheme("walk");
  e.music.current.out.gain.value = 0;
  e.setTheme("silent");
  e.ctx.currentTime = 4.5;
  e.music.tick();
  e.music.theme = "walk";
  stateIs("suspended");
  e.paused = true;
  e.unlock();
  e.paused = false;
  e.unlock();
  e.music.tick();
  e.play("slam");
  stateIs("running");
  e.muted = true;
  e.play("win");
  e.muted = false;
  e.paused = true;
  e.play("lose");
  e.paused = false;
  e.play("heal", { volume: 2, pan: -3 });
  e.sfx.activeSfx = 30;
  e.play("step");
  e.sfx.activeSfx = 0;
  vi.stubGlobal("setTimeout", (fn: () => void) => fn());
  e.play("slam");
  expect([e.muted, e.paused, e.theme, e.trackName]).toHaveLength(4);
  expect(e.sfx.activeSfx).toBe(0);

  const late: any = new AudioEngine(audioParts());

  late.paused = true;
  late.muted = true;
  late.init();
  late.play("shatter");

  const prefixed = vi.fn(function () {
    return e.ctx;
  });

  vi.stubGlobal("AudioContext", undefined);
  vi.stubGlobal("webkitAudioContext", prefixed);
  void new AudioEngine(audioParts()).unlock();
  expect(prefixed).toHaveBeenCalledWith({ latencyHint: "interactive" });
  vi.stubGlobal("AudioContext", () => {
    throw new Error("no context");
  });
  void new AudioEngine(audioParts()).unlock();
};

const all: Runs = {};

describe("audio engine proof", () => {
  playsTwice(
    [
      ["engine bodies", bodies],
      ["engine control", control],
      ["engine seams", seams],
      ["engine surface", surface],
    ],
    all,
  );
  matchesCommittedLog(all, "./__snapshots__/audio-engine-proof.json");
});
