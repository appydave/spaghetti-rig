// The audio proof harness (N6). It plays every sound effect against a recording engine and a seeded Math.random, and writes down every
// tone, noise, brass and trombone voice the effect asked for, with its start time and every parameter; and it plays every step of every
// track on a recording AudioContext, written as a hash and an entry count. Two trees that write the same log play the same sounds. The
// log is committed as lint/gates/__snapshots__/audio-proof.json, so every pull request proves in CI that it plays the same sounds, and
// an intended change shows as a diff of that file (`npx vitest run -u` rewrites it). The engine's own scenarios are in
// audio-engine-proof.test.ts.
//
// It also guards the effects: the same seed gives the same log, and no effect is silent.
import { describe, expect, it } from "vitest";
import { scheduleDeck, scheduleStep } from "../../src/audio/music/sequencer";
import { COMPILED_TRACKS } from "../../src/audio/tracks";
import {
  matchesCommittedLog,
  playsTwice,
  record,
  SFX,
  type Runs,
} from "./support/audio-recorder";

const SEEDS = 20;

const all: Runs = {};

const runs: [string, (e: any) => void][] = COMPILED_TRACKS.map(
  (track): [string, (e: any) => void] => [
    `track ${track.def.name}`,
    (e: any) => {
      const deck = e.music.createDeck(track, 1, 0.03);

      e.music.current = deck;
      e.music.theme = track.def.theme;
      for (let loop = 0; loop < 2; loop++) {
        for (let idx = 0; idx < track.totalSteps; idx++) {
          scheduleStep(
            { deck, idx, loop, t: 1 + idx * 0.01 },
            e.music.sequencer.voices,
          );
        }
      }

      for (let n = 1; n <= 12; n++) {
        scheduleDeck(deck, 1, 1 + track.stepSec * 200 * n, e.music.sequencer);
      }

      // A call that needs more steps than the scheduler's guard allows, on a deck that is not the current one (so it cannot rotate).
      const long = e.music.createDeck(track, 1, 0.03);

      long.abs = 7;
      scheduleDeck(long, 1, 1 + track.stepSec * 300, e.music.sequencer);
      e.music.retire(long, 2, 1);
      e.music.retire(deck, 2, 1);
      e.music.disposeDeck(deck);
    },
  ],
);

describe("audio proof harness", () => {
  playsTwice(runs, all);

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

  matchesCommittedLog(all, "./__snapshots__/audio-proof.json");
});
