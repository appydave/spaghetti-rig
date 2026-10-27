import { nth, present } from "#root/src/nth.ts";
import {
  bool,
  list,
  num,
  numOr,
  obj,
  oneOf,
} from "#root/src/world/model-load.ts";
import type { NoiseOpts, ToneOpts } from "#root/src/audio/audio.ts";
import { midiToFreq } from "#root/src/audio/tracks.ts";

/**
 * The sound-effect recipe grammar (sfx.json). It is closed: a new shape is a ruling, not an edit. Widened once, in N6c.
 *   recipe = a list of layers, played in order.
 *   layer  = { kind: "tone" | "noise" | "brass" | "trombone", dur, at?, repeat?, and by kind:
 *              tone: wave, f | note | notes, f2?, vol, attack?, lp?      noise: filter, f, f2?, vol, attack?, q?
 *              brass: note | notes, vol                                  trombone: note | notes, wobble }
 *   range  = { min, max }  a number drawn between the two; f, f2, dur, vol and at may each be one.
 *   note   = a midi number (a fixed note), or a list [midi, ...] of which one is drawn at random.
 *   notes  = [midi, ...]   the layer plays once per note, in order, one step apart: the note is the only thing that changes.
 *   repeat = { count, start, step }  the layer plays count times (not with notes), the first start seconds in, then every step seconds.
 * A parsed layer with a field its kind does not have is refused. A play draws its random numbers in the order at, f (or a drawn
 * note), f2, dur, vol; a fixed note, notes and the brass and trombone voices draw none, so a seeded run replays exactly.
 * A value such as 0.11200000000000002 is the exact double the old arithmetic produced (0.14 * 0.8); it stays exact so the seeded proof stays exact.
 * sfx.json keeps one layer per line: .prettierrc.json gives it printWidth 240 (widest layer 212 columns the day it was set; 160 and 200 wrapped).
 * A layer that wraps at 240 has outgrown this grammar and comes back as a ruling; the width never goes up.
 */
type Amount = number | { min: number; max: number };
type Pitch = { hz: Amount } | { pick: number[] } | { seq: number[] };
export interface Layer {
  kind: "tone" | "noise" | "brass" | "trombone";
  pitch: Pitch;
  dur: Amount;
  at?: Amount;
  repeat: { count: number; start: number; step: number };
  wave: OscillatorType;
  filter: BiquadFilterType;
  vol: Amount;
  f2?: Amount;
  attack?: number;
  lp?: number;
  q?: number;
  wobble: boolean;
}
export type Play =
  | { kind: "tone"; at: number; opts: ToneOpts }
  | { kind: "noise"; at: number; opts: NoiseOpts }
  | { kind: "brass"; at: number; midi: number; dur: number; vol: number }
  | {
      kind: "trombone";
      at: number;
      midi: number;
      dur: number;
      wobble: boolean;
    };

const KINDS = ["tone", "noise", "brass", "trombone"] as const;
const SHARED = ["kind", "dur", "at", "repeat", "note", "notes"];
const OWN = {
  tone: ["wave", "f", "f2", "vol", "attack", "lp"],
  noise: ["filter", "f", "f2", "vol", "attack", "q"],
  brass: ["vol"],
  trombone: ["wobble"],
};

const amount = (v: unknown, path: string): Amount => {
  if (typeof v === "number") {
    return v;
  }

  const o = obj(v, path);

  return { min: num(o.min, `${path}.min`), max: num(o.max, `${path}.max`) };
};

const maybe = <T>(v: unknown, read: (x: unknown) => T): T | undefined =>
  v === undefined ? undefined : read(v);

type Loose = ReturnType<typeof obj>;

const owns = (kind: Layer["kind"], k: string): boolean => OWN[kind].includes(k);

/** Refuse a layer with a field its kind does not have, with no pitch, or with notes beside note or repeat.count. */
function refuseMisfits(
  o: Loose,
  kind: Layer["kind"],
  rep: Loose,
  path: string,
) {
  const unknown = Object.keys(o).find(
    (k) => ![...SHARED, ...OWN[kind]].includes(k),
  );

  if (unknown) {
    throw new Error(`${path}.${unknown} is not a field of a ${kind} layer`);
  }

  if (!owns(kind, "f") && o.note === undefined && o.notes === undefined) {
    throw new Error(`${path}.note: a ${kind} layer needs note or notes`);
  }

  if (o.notes !== undefined && (o.note ?? rep.count) !== undefined) {
    throw new Error(`${path}.notes cannot go with note or repeat.count`);
  }
}

const noteList = (v: unknown, path: string): number[] =>
  list(v, path).map((m) => num(m, path));

/** The notes a layer plays in order: a list of notes, or a lone fixed note. */
function sequenceOf(o: Loose, path: string): number[] | undefined {
  return (
    maybe(o.notes, (v) => noteList(v, `${path}.notes`)) ??
    (typeof o.note === "number" ? [o.note] : undefined)
  );
}

function parseLayer(raw: unknown, path: string): Layer {
  const o = obj(raw, path);
  const at = (k: string): string => `${path}.${k}`;
  const kind = oneOf(o.kind, KINDS, at("kind"));
  const rep = obj(o.repeat ?? {}, at("repeat"));

  refuseMisfits(o, kind, rep, path);

  const seq = sequenceOf(o, path);

  return {
    kind,
    pitch: seq
      ? { seq }
      : (maybe(o.note, (v) => ({ pick: noteList(v, at("note")) })) ?? {
          hz: amount(o.f, at("f")),
        }),
    dur: amount(o.dur, at("dur")),
    at: maybe(o.at, (v) => amount(v, at("at"))),
    repeat: {
      count: seq ? seq.length : numOr(rep.count, 1, at("repeat.count")),
      start: numOr(rep.start, 0, at("repeat.start")),
      step: numOr(rep.step, 0, at("repeat.step")),
    },
    wave: owns(kind, "wave")
      ? oneOf(o.wave, ["sine", "square", "sawtooth", "triangle"], at("wave"))
      : "sine",
    filter: owns(kind, "filter")
      ? oneOf(o.filter, ["lowpass", "highpass", "bandpass"], at("filter"))
      : "lowpass",
    vol: owns(kind, "vol") ? amount(o.vol, at("vol")) : 0,
    f2: maybe(o.f2, (v) => amount(v, at("f2"))),
    attack: maybe(o.attack, (v) => num(v, at("attack"))),
    lp: maybe(o.lp, (v) => num(v, at("lp"))),
    q: maybe(o.q, (v) => num(v, at("q"))),
    wobble: bool(o.wobble, false, at("wobble")),
  };
}

/** sfx.json parsed: one list of layers per effect name. */
export function parseSfx(raw: unknown): Map<string, Layer[]> {
  return new Map(
    Object.entries(obj(raw, "sfx")).map(([name, v]) => [
      name,
      list(obj(v, name).layers, `${name}.layers`).map((l, i) =>
        parseLayer(l, `${name}.layers[${i}]`),
      ),
    ]),
  );
}

const draw = (a: Amount): number =>
  typeof a === "number" ? a : a.min + Math.random() * (a.max - a.min);

/** The midi note a layer plays at repeat i: none for a pitch in hertz, the i-th of a sequence, or one drawn from the list. */
function midiOf(p: Pitch, i: number): number | undefined {
  if ("hz" in p) {
    return undefined;
  }

  if ("seq" in p) {
    return nth(p.seq, i, "notes");
  }

  return nth(p.pick, Math.floor(Math.random() * p.pick.length), "note list");
}

/** A brass or trombone voice: its length is drawn first, then (brass) its volume. */
function horn(l: Layer, at: number, midi: number | undefined): Play {
  const dur = draw(l.dur);
  const note = present(midi, "the note of a brass or trombone layer");

  return l.kind === "brass"
    ? { kind: "brass", at, midi: note, dur, vol: draw(l.vol) }
    : { kind: "trombone", at, midi: note, dur, wobble: l.wobble };
}

function play(l: Layer, t: number, i: number): Play {
  const r = l.repeat;
  const p = l.pitch;
  const at = t + r.start + i * r.step + (l.at === undefined ? 0 : draw(l.at));
  const midi = midiOf(p, i);

  if (l.kind === "brass" || l.kind === "trombone") {
    return horn(l, at, midi);
  }

  const voice = {
    f: "hz" in p ? draw(p.hz) : midiToFreq(present(midi, "the note")),
    f2: l.f2 && draw(l.f2),
    dur: draw(l.dur),
    vol: draw(l.vol),
    attack: l.attack,
  };

  return l.kind === "tone"
    ? { kind: "tone", at, opts: { ...voice, type: l.wave, lp: l.lp } }
    : { kind: "noise", at, opts: { ...voice, filter: l.filter, q: l.q } };
}

/** Every voice an effect plays from time t, in the order the old code played them. */
export function expandSfx(layers: Layer[], t: number): Play[] {
  return layers.flatMap((l) =>
    Array.from({ length: l.repeat.count }, (_, i) => play(l, t, i)),
  );
}
