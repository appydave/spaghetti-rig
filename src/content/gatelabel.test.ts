import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gateLabel, gatesText, gateText } from "#root/src/content/gatelabel.ts";

describe("gate labels", () => {
  it("splits a gate into a number badge and a title, with no G code", () => {
    expect(gateLabel("G01 · Formatting")).toEqual({
      num: "1",
      title: "Formatting",
    });
    expect(gateLabel("G02 · Lint + anti-slop")).toEqual({
      num: "2",
      title: "Lint + anti-slop",
    });
    expect(gateLabel("G00a · CI runs every gate")).toEqual({
      num: "0a",
      title: "CI runs every gate",
    });
    expect(gateLabel("G12 · Boundaries")).toEqual({
      num: "12",
      title: "Boundaries",
    });
  });

  it("keeps a gate with no code as its title", () => {
    expect(gateLabel("Brand new gate")).toEqual({
      num: "",
      title: "Brand new gate",
    });
  });

  it("writes plain text and tier ranges without the G prefix", () => {
    expect(gateText("G05 · Magic numbers")).toBe("Gate 5 · Magic numbers");
    expect(gatesText("G00–G02")).toBe("Gates 0–2");
    expect(gatesText("G06")).toBe("Gate 6");
  });

  it('no gate in the content file shows a "G0" code once labelled', () => {
    const raw = JSON.parse(
      readFileSync(
        new URL("../../public/content/cards.json", import.meta.url),
        "utf8",
      ),
    );

    for (const s of raw.stops) {
      const g = gateLabel(s.gate);

      expect(g.num).not.toBe("");
      expect(`${g.num} ${g.title} ${gateText(s.gate)}`).not.toMatch(/G\d/);
    }

    for (const t of raw.tiers) {
      expect(gatesText(t.gates)).not.toMatch(/G\d/);
    }
  });
});
