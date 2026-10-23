import {
  choice,
  flag,
  many,
  number,
  object,
  place,
  text,
  type Infer,
} from "./schema";

/** The checkpoint gate as data (gate.json): where each part sits and how big it is, keyed by name. Its type is read off the schema. */
export const GATE_COLOURS = [
  "post",
  "foot",
  "beam",
  "ink",
  "boomStripe",
  "boomStripeGap",
  "check",
] as const;

const colour = choice(GATE_COLOURS);
const pillarPart = object({
  name: text,
  shape: choice(["box", "soft"]),
  colour,
  size: place(["x", "y", "z"]),
  outlined: flag(true),
  /** Where the part sits on a pillar, measured from the pillar's line. */
  at: many(place(["y"])),
});

export const GATE_SCHEMA = object({
  pillar: object({ margin: number, parts: many(pillarPart) }),
  beam: object({
    colour,
    overhang: number,
    size: place(["y", "z"]),
    at: place(["y"]),
  }),
  sign: object({ width: number, height: number, at: place(["y", "z"]) }),
  signPosts: object({
    colour,
    size: place(["x", "y", "z"]),
    outlined: flag(true),
    at: many(place(["y"])),
  }),
  light: object({
    radius: number,
    widthSegments: number,
    heightSegments: number,
    at: place(["y"]),
  }),
  check: object({
    colour,
    radius: number,
    tube: number,
    radialSegments: number,
    tubularSegments: number,
  }),
  boom: object({
    hinge: object({ inset: number, y: number }),
    count: number,
    start: number,
    length: number,
    size: place(["y", "z"]),
    colours: many(colour),
    outlinedFirst: flag(true),
    outlinedRest: flag(true),
  }),
});

export type GateModel = Infer<typeof GATE_SCHEMA>;
