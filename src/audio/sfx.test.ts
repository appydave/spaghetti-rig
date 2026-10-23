import { afterEach, describe, expect, it, vi } from "vitest";
import { expandSfx, parseSfx } from "./sfx";
import { midiToFreq } from "./tracks";

type Item =
  | number
  | string
  | number[]
  | { min?: number; max?: number; count?: number | string };
type Spec = Record<string, Item>;

const tone = { kind: "tone", wave: "sine", f: 440, dur: 0.1, vol: 0.2 };
const noise = { kind: "noise", filter: "lowpass", f: 900, dur: 0.1, vol: 0.2 };
const range = (min: number, max: number) => ({ min, max });
const play = (spec: Spec, t = 0) =>
  expandSfx(parseSfx({ fx: { layers: [spec] } }).get("fx") ?? [], t);
const bad = (spec: Spec, message: RegExp) =>
  expect(() => play(spec)).toThrow(message);

afterEach(() => vi.restoreAllMocks());

describe("sfx layer", () => {
  it("plays a tone and a noise with what the recipe gives them, at the start time", () => {
    expect(play({ ...tone, f2: 220, lp: 3000 }, 5)).toEqual([
      {
        kind: "tone",
        at: 5,
        opts: { type: "sine", f: 440, f2: 220, dur: 0.1, vol: 0.2, lp: 3000 },
      },
    ]);
    expect(play({ ...noise, q: 2, attack: 0.1 })).toMatchObject([
      { kind: "noise", opts: { filter: "lowpass", q: 2, attack: 0.1 } },
    ]);
  });

  it("refuses an unknown wave, filter or kind, and a layer that is not an object", () => {
    bad({ ...tone, wave: "kazoo" }, /fx.layers\[0\].wave must be one of/);
    bad({ ...noise, filter: "notch" }, /filter must be one of/);
    bad({ ...tone, kind: "drum" }, /kind must be one of/);
    expect(() => parseSfx({ fx: { layers: [7] } })).toThrow(
      /must be an object/,
    );
  });
});

describe("sfx range", () => {
  it("draws at, f, f2, dur and vol between min and max, in that order", () => {
    const random = vi.spyOn(Math, "random");

    for (const r of [0.5, 0.25, 0, 1, 0.1]) {
      random.mockReturnValueOnce(r);
    }

    const [p] = play(
      {
        ...tone,
        at: range(0, 1),
        f: range(100, 200),
        f2: range(0, 40),
        dur: range(1, 2),
        vol: range(0.1, 0.3),
      },
      1,
    );

    expect(p?.at).toBe(1.5);
    expect(p?.opts).toMatchObject({ f: 125, f2: 0, dur: 2 });
    expect(p?.opts.vol).toBeCloseTo(0.12);
  });

  it("refuses a range with no max", () => {
    bad({ ...tone, f: { min: 1 } }, /fx.layers\[0\].f.max must be a number/);
  });
});

describe("sfx choice", () => {
  it("plays one note of the list, at its pitch", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    expect(
      play({
        kind: "tone",
        wave: "sine",
        dur: 0.1,
        vol: 0.2,
        note: [60, 64, 67],
      })[0]?.opts.f,
    ).toBe(midiToFreq(67));
  });

  it("refuses a note list that is not a list of numbers", () => {
    bad({ ...tone, note: "C4" }, /note must be a list/);
    bad({ ...tone, note: [60, "E4"] }, /note must be a number/);
  });
});

describe("sfx repeat", () => {
  it("plays the layer count times, the first start seconds in and then every step", () => {
    const times = play(
      { ...tone, repeat: { count: 3, start: 0.15, step: 0.05 } },
      2,
    ).map((p) => p.at);

    expect(times).toEqual([2 + 0.15, 2 + 0.15 + 1 * 0.05, 2 + 0.15 + 2 * 0.05]);
  });

  it("refuses a repeat that is not made of numbers, and a file that is not a set of recipes", () => {
    bad(
      { ...tone, repeat: { count: "three" } },
      /repeat.count must be a number/,
    );
    expect(() => parseSfx([])).toThrow(/sfx must be an object/);
    expect(() => parseSfx({ fx: { layers: 1 } })).toThrow(
      /fx.layers must be a list/,
    );
  });
});

describe("sfx widened in N6c", () => {
  const brass = { kind: "brass", note: 60, dur: 0.5, vol: 0.1 };

  it("plays a fixed note, and a list of notes in order, without drawing any random number", () => {
    const random = vi.spyOn(Math, "random");
    const fixed = { kind: "tone", wave: "sine", dur: 0.1, vol: 0.2 };
    const seq = play(
      { ...fixed, notes: [60, 64], repeat: { start: 1, step: 0.5 } },
      2,
    );

    expect(play({ ...fixed, note: 88 })[0]?.opts.f).toBe(midiToFreq(88));
    expect(seq.map((p) => [p.at, p.opts.f])).toEqual([
      [3, midiToFreq(60)],
      [3.5, midiToFreq(64)],
    ]);
    expect(random).not.toHaveBeenCalled();
  });

  it("refuses notes that are not a list, or that go with note or repeat.count", () => {
    bad({ ...tone, notes: "C4" }, /notes must be a list/);
    bad(
      { ...tone, notes: [60], note: 60 },
      /notes cannot go with note or repeat.count/,
    );
    bad({ ...tone, notes: [60], repeat: { count: 2 } }, /notes cannot go with/);
  });

  it("refuses a wobble that is not true or false", () => {
    bad(
      { kind: "trombone", note: 55, dur: 1, wobble: "yes" },
      /fx.layers\[0\].wobble must be true or false/,
    );
  });

  it("plays brass and trombone voices from a note", () => {
    expect(
      play({ kind: "brass", notes: [60, 64], dur: 0.5, vol: 0.1 }, 1),
    ).toEqual([
      { kind: "brass", at: 1, midi: 60, dur: 0.5, vol: 0.1 },
      { kind: "brass", at: 1, midi: 64, dur: 0.5, vol: 0.1 },
    ]);
    expect(play({ kind: "trombone", note: 55, dur: 1, wobble: true })).toEqual([
      { kind: "trombone", at: 0, midi: 55, dur: 1, wobble: true },
    ]);
  });

  it("refuses a field its kind does not have, and a brass layer with no note", () => {
    bad(
      { ...brass, wave: "sine" },
      /fx.layers\[0\].wave is not a field of a brass layer/,
    );
    bad({ ...noise, lp: 100 }, /lp is not a field of a noise layer/);
    bad(
      { kind: "brass", dur: 1, vol: 1 },
      /fx.layers\[0\].note: a brass layer needs note or notes/,
    );
    bad({ kind: "trombone", dur: 1 }, /a trombone layer needs note or notes/);
  });
});
