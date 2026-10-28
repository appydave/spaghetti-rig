import { describe, expect, it } from "vitest";
import { fit, wrap } from "#root/src/world/code-window/canvas-text.ts";

/** A canvas context that measures text as 1 px per character per px of font size (font "20px" makes each character 20 wide). */
function context() {
  const g = {
    font: "1px x",
    measureText: (s: string) =>
      ({
        width: s.length * Number(/(\d+)px/.exec(g.font)?.[1]),
      }) as TextMetrics,
  };

  return g as CanvasRenderingContext2D;
}

describe("wrap", () => {
  it("breaks at the last word that fits, never inside a word", () => {
    expect(wrap(context(), "one two three four", 8)).toEqual([
      "one two",
      "three",
      "four",
    ]);
  });

  it("puts a word wider than the line on a line of its own", () => {
    expect(wrap(context(), "a enormousword b", 5)).toEqual([
      "a",
      "enormousword",
      "b",
    ]);
  });

  it("ignores leading, trailing and doubled spaces, and gives no lines for no words", () => {
    expect(wrap(context(), "  one   two  ", 100)).toEqual(["one two"]);
    expect(wrap(context(), "   ", 100)).toEqual([]);
    expect(wrap(context(), "", 100)).toEqual([]);
  });

  it("measures a line with a single space between words", () => {
    expect(wrap(context(), "ab cd", 5)).toEqual(["ab cd"]);
    expect(wrap(context(), "ab cd", 4)).toEqual(["ab", "cd"]);
  });
});

describe("fit", () => {
  const spec = (width: number, lines: number) => ({
    font: (px: number) => `${px}px x`,
    width,
    lines,
    from: 40,
    to: 10,
    step: 4,
  });

  it("returns the biggest size, counting down in steps, at which the words fit their lines", () => {
    // "hello world" is 11 characters, so it is 11 * px wide: sizes go 40, 36, ... and 12 (132) is still too wide for 130, so it falls back to the smallest, 10.
    const r = fit(context(), "hello world", spec(130, 1));

    expect(r).toEqual({ px: 10, lines: ["hello world"] });
    // For 250: 24 px is 264 wide (too wide), 20 px is 220.
    expect(fit(context(), "hello world", spec(250, 1)).px).toBe(20);
    expect(fit(context(), "hello world", spec(250, 1)).lines).toEqual([
      "hello world",
    ]);
  });

  it("spreads over more lines when it is allowed them, and so can stay bigger", () => {
    const one = fit(context(), "hello world", spec(250, 1));
    const two = fit(context(), "hello world", spec(250, 2));

    expect(two.px).toBeGreaterThan(one.px);
    expect(two.lines).toEqual(["hello", "world"]);
  });

  it("falls back to the smallest size, cut to the lines it may have, when nothing fits", () => {
    const r = fit(context(), "aaaa bbbb cccc dddd", spec(10, 2));

    expect(r.px).toBe(10);
    expect(r.lines).toEqual(["aaaa", "bbbb"]);
  });
});
