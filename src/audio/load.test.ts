import { describe, it, expect } from "vitest";
import { parseTrackDefs } from "./load";

const minimal = { name: "T", theme: "walk", melody: ["C4/16"], harmony: [] };

describe("parseTrackDefs", () => {
  it("fills in what a track leaves out", () => {
    const [t] = parseTrackDefs([minimal]);

    expect(t).toMatchObject({
      name: "T",
      theme: "walk",
      bpm: 120,
      beatsPerBar: 4,
      loops: 1,
      lead: "triangle",
      pad: "warm",
      arpVoice: "pluck",
      bass: "",
      arp: "",
    });
    expect(t?.swing).toBeUndefined();
    expect(t?.mix).toBeUndefined();
  });

  it("keeps what a track says, and only valid mix levels", () => {
    const [t] = parseTrackDefs([
      {
        ...minimal,
        bpm: 99,
        swing: 0.1,
        lead: "saw",
        mix: { lead: 0.5, tuba: 1, arp: "loud" },
      },
    ]);

    expect(t).toMatchObject({ bpm: 99, swing: 0.1, lead: "saw" });
    expect(t?.mix).toEqual({ lead: 0.5 });
  });

  it("keeps a track's notes when they are text, and drops them when they are not", () => {
    expect(
      parseTrackDefs([{ ...minimal, notes: "Fmaj7 | Am7" }])[0]?.notes,
    ).toBe("Fmaj7 | Am7");
    expect(
      parseTrackDefs([{ ...minimal, notes: 7 }])[0]?.notes,
    ).toBeUndefined();
  });

  it("falls back on an unknown voice and drops entries that are not objects", () => {
    const list = parseTrackDefs([{ ...minimal, pad: "kazoo" }, 7, null, "x"]);

    expect(list).toHaveLength(1);
    expect(list[0]?.pad).toBe("warm");
  });

  it("refuses a track with no known theme, and a score that is not a list", () => {
    expect(() => parseTrackDefs([{ ...minimal, theme: "silent" }])).toThrow(
      /no known theme/,
    );
    expect(parseTrackDefs({ not: "a list" })).toEqual([]);
  });
});
