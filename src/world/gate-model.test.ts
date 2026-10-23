import { describe, expect, it } from "vitest";
import gateJson from "./gate.json";
import { GATE_SCHEMA } from "./gate-model";
import { GATE } from "./palette";

describe("gate model", () => {
  const model = GATE_SCHEMA.read(gateJson, "gate");
  const [post] = model.pillar.parts;

  it("reads gate.json: parts by name, and every colour named is in the palette", () => {
    expect(model.pillar.parts.map((p) => p.name)).toEqual([
      "post",
      "ring",
      "foot",
    ]);
    expect(model.boom.hinge).toEqual({ inset: 0.3, y: 1.25 });

    for (const c of [
      model.beam.colour,
      model.check.colour,
      ...model.boom.colours,
    ]) {
      expect(GATE).toHaveProperty(c);
    }
  });

  it.each([
    [
      "colour",
      { beam: { ...model.beam, colour: "teal" } },
      /beam.colour must be one of/,
    ],
    [
      "shape",
      { pillar: { ...model.pillar, parts: [{ ...post, shape: "cone" }] } },
      /parts\[0\].shape must be one of/,
    ],
    [
      "size",
      {
        pillar: { ...model.pillar, parts: [{ ...post, size: { x: 1, y: 1 } }] },
      },
      /parts\[0\].size.z must be a number/,
    ],
    [
      "count",
      { boom: { ...model.boom, count: "7" } },
      /boom.count must be a number/,
    ],
  ])("refuses a bad %s", (_what, change, message) => {
    expect(() => GATE_SCHEMA.read({ ...model, ...change }, "gate")).toThrow(
      message,
    );
  });
});
