import { nth } from "../nth";
import { list, num, numOr, obj, oneOf } from "../world/model-load";
import type { NoiseOpts, ToneOpts } from "./audio";
import { midiToFreq } from "./tracks";

/**
 * The sound-effect recipe grammar (sfx.json). It is closed: a fifth shape is a ruling, not an edit.
 *   recipe = a list of layers, played in order.
 *   layer  = { kind: "tone" | "noise", wave (tone) | filter (noise), f | note, f2?, dur, vol, at?, repeat?, attack?, lp? (tone), q? (noise) }
 *   range  = { min, max }  a number drawn between the two; f, f2, dur, vol and at may each be one.
 *   choice = [midi, ...]   `note` only: one of the list is drawn and played at its pitch.
 *   repeat = { count, start, step }  the layer plays count times, the first start seconds in, then every step seconds.
 * A play draws its random numbers in the order at, f (or note), f2, dur, vol, so a seeded run replays exactly.
 * sfx.json keeps one layer per line: .prettierrc.json gives it printWidth 240 (widest layer 212 columns the day it was set; 160 and 200 wrapped).
 * A layer that wraps at 240 has outgrown this grammar and comes back as a ruling; the width never goes up.
 */
type Amount = number | { min: number; max: number };
export type Layer = {
  pitch: Amount | number[];
  f2?: Amount;
  dur: Amount;
  vol: Amount;
  at?: Amount;
  attack?: number;
  repeat: { count: number; start: number; step: number };
} & (
  | { kind: "tone"; shape: OscillatorType; lp?: number }
  | { kind: "noise"; shape: BiquadFilterType; q?: number }
);
export type Play =
  | { kind: "tone"; at: number; opts: ToneOpts }
  | { kind: "noise"; at: number; opts: NoiseOpts };

const WAVES = ["sine", "square", "sawtooth", "triangle"] as const;
const FILTERS = ["lowpass", "highpass", "bandpass"] as const;

const amount = (v: unknown, path: string): Amount => {
  if (typeof v === "number") {
    return v;
  }

  const o = obj(v, path);

  return { min: num(o.min, `${path}.min`), max: num(o.max, `${path}.max`) };
};

const maybe = <T>(v: unknown, read: (x: unknown) => T): T | undefined =>
  v === undefined ? undefined : read(v);

function parseLayer(raw: unknown, path: string): Layer {
  const o = obj(raw, path);
  const at = (k: string): string => `${path}.${k}`;
  const rep = obj(o.repeat ?? {}, at("repeat"));
  const number = (k: string): number | undefined =>
    maybe(o[k], (v) => num(v, at(k)));
  const common = {
    pitch:
      maybe(o.note, (v) =>
        list(v, at("note")).map((m) => num(m, at("note"))),
      ) ?? amount(o.f, at("f")),
    f2: maybe(o.f2, (v) => amount(v, at("f2"))),
    dur: amount(o.dur, at("dur")),
    vol: amount(o.vol, at("vol")),
    at: maybe(o.at, (v) => amount(v, at("at"))),
    attack: number("attack"),
    repeat: {
      count: numOr(rep.count, 1, at("repeat.count")),
      start: numOr(rep.start, 0, at("repeat.start")),
      step: numOr(rep.step, 0, at("repeat.step")),
    },
  };

  return oneOf(o.kind, ["tone", "noise"], at("kind")) === "tone"
    ? {
        ...common,
        kind: "tone",
        shape: oneOf(o.wave, WAVES, at("wave")),
        lp: number("lp"),
      }
    : {
        ...common,
        kind: "noise",
        shape: oneOf(o.filter, FILTERS, at("filter")),
        q: number("q"),
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

function play(l: Layer, t: number, i: number): Play {
  const r = l.repeat;
  const at = t + r.start + i * r.step + (l.at === undefined ? 0 : draw(l.at));
  const f = Array.isArray(l.pitch)
    ? midiToFreq(
        nth(l.pitch, Math.floor(Math.random() * l.pitch.length), "note list"),
      )
    : draw(l.pitch);
  const voice = {
    f,
    f2: l.f2 && draw(l.f2),
    dur: draw(l.dur),
    vol: draw(l.vol),
    attack: l.attack,
  };

  return l.kind === "tone"
    ? { kind: "tone", at, opts: { ...voice, type: l.shape, lp: l.lp } }
    : { kind: "noise", at, opts: { ...voice, filter: l.shape, q: l.q } };
}

/** Every voice an effect plays from time t, in the order the old code played them. */
export function expandSfx(layers: Layer[], t: number): Play[] {
  return layers.flatMap((l) =>
    Array.from({ length: l.repeat.count }, (_, i) => play(l, t, i)),
  );
}
