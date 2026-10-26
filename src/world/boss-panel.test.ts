import { describe, expect, it, vi } from "vitest";

/** Every fillText the panel made: the words, where, and the font that was set when it did. */
interface Drawn {
  text: string;
  x: number;
  y: number;
  font: string;
}

const drawn: Drawn[] = [];

/** A context that measures text as 0.55 of the font size per character, and notes every fillText. */
function recorder() {
  const state = { font: "10px x" };
  const px = () => Number(/(\d+(?:\.\d+)?)px/.exec(state.font)?.[1]);

  return new Proxy(state, {
    get: (t, p: string) => {
      if (p === "font") {
        return t.font;
      }

      if (p === "measureText") {
        return (s: string) => ({ width: s.length * px() * 0.55 });
      }

      if (p === "fillText") {
        return (text: string, x: number, y: number) =>
          drawn.push({ text, x, y, font: t.font });
      }

      return () => undefined;
    },
    set: (t, p: string, v: string) => {
      if (p === "font") {
        t.font = v;
      }

      return true;
    },
  });
}

vi.stubGlobal("document", {
  createElement: (tag: string) =>
    tag === "canvas"
      ? { width: 0, height: 0, getContext: () => recorder(), style: {} }
      : {},
});

const { paintBossPanel } = await import("./boss");

const PAD = 40;
const BAR_BOTTOM = 16 + 150 + 18;
const sizeOf = (d: Drawn) => Number(/(\d+(?:\.\d+)?)px/.exec(d.font)?.[1]);

/** Paint a panel and return its height and what was drawn. */
function paint(aspect: number, text: Parameters<typeof paintBossPanel>[0]) {
  drawn.length = 0;

  const canvas = paintBossPanel({ ...text, aspect });

  return { height: canvas.height, drawn: [...drawn] };
}

describe("the panel's size", () => {
  it("is 1200 wide and as tall as the window's shape says", () => {
    expect(paint(2, { aspect: 2, header: "h", title: "t" }).height).toBe(600);
    expect(paint(3, { aspect: 3, header: "h", title: "t" }).height).toBe(400);
  });
});

describe("the header", () => {
  it("is upper-case, in the biggest size that fits one line, counting down by 4 from 112", () => {
    const { drawn: d } = paint(2, {
      aspect: 2,
      header: "twenty chars exactly",
      title: "t",
    });
    const head = d[0];

    // 944 px of room (1200 less the dots and the padding): 20 characters at 0.55 are 11 * px wide, so 84 px is the first size that fits.
    expect(head?.text).toBe("TWENTY CHARS EXACTLY");
    expect(head ? sizeOf(head) : 0).toBe(84);
    expect(head?.x).toBe(66 + 3 * 50);
  });

  it("settles on 50 px when it can never fit, and shows only the first line", () => {
    const { drawn: d } = paint(2, {
      aspect: 2,
      header: "word ".repeat(120),
      title: "t",
    });

    expect(d[0] ? sizeOf(d[0]) : 0).toBe(50);
    expect(d[0]?.text.split(" ").length).toBeLessThan(120);
  });
});

describe("the title", () => {
  it("is upper-case and centred in the body between the bar and the bottom padding", () => {
    const { height, drawn: d } = paint(2, {
      aspect: 2,
      header: "h",
      title: "short",
    });
    const title = d[1];
    const top = BAR_BOTTOM;
    const bodyH = height - PAD - top;

    expect(title?.text).toBe("SHORT");
    expect(title?.x).toBe(PAD);
    expect(title?.y).toBeCloseTo(top + bodyH / 2, 6);
  });

  it("takes up to three lines, spaced at 0.9 of its size, and stays centred as a block", () => {
    const { height, drawn: d } = paint(2, {
      aspect: 2,
      header: "h",
      title:
        "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu",
    });
    const lines = d.slice(1);
    const size = sizeOf(lines[0] ?? { text: "", x: 0, y: 0, font: "" });

    // The size is one of the steps down from 320 by 4.
    expect((320 - size) % 4).toBe(0);
    expect(size).toBeLessThan(320);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.length).toBeGreaterThan(1);
    for (const [i, l] of lines.entries()) {
      expect(l.text).toBe(l.text.toUpperCase());
      if (i > 0) {
        expect(l.y - (lines[i - 1]?.y ?? 0)).toBeCloseTo(size * 0.9, 6);
      }
    }

    const middle = ((lines[0]?.y ?? 0) + (lines.at(-1)?.y ?? 0)) / 2;

    expect(middle).toBeCloseTo(BAR_BOTTOM + (height - PAD - BAR_BOTTOM) / 2, 6);
  });

  it.each([
    [2.5, "alpha beta gamma delta epsilon zeta"],
    [3, "one two three four five six seven eight nine"],
    [4, "short title here"],
  ])(
    "comes down in size until its lines fit the body's height, or 70 px (aspect %s)",
    (aspect, title) => {
      const { height, drawn: d } = paint(aspect, {
        aspect,
        header: "h",
        title,
      });
      const lines = d.slice(1);
      const size = sizeOf(lines[0] ?? { text: "", x: 0, y: 0, font: "" });
      const bodyH = height - PAD - BAR_BOTTOM;

      expect(size === 70 || lines.length * size * 0.9 <= bodyH).toBe(true);
    },
  );

  it("settles on 70 px and three lines when the title can never fit", () => {
    const { drawn: d } = paint(2, {
      aspect: 2,
      header: "h",
      title: "word ".repeat(300),
    });
    const lines = d.slice(1);

    expect(lines).toHaveLength(3);
    expect(sizeOf(lines[0] ?? { text: "", x: 0, y: 0, font: "" })).toBe(70);
  });
});

describe("the badge and the footer", () => {
  it("puts the words after a square badge that is 62% of the body tall, up to 250 px", () => {
    const wide = paint(3, { aspect: 3, header: "h", title: "t", badge: "3" });
    const bodyH = wide.height - PAD - BAR_BOTTOM;
    const b = bodyH * 0.62;

    expect(wide.drawn.at(-1)?.x).toBeCloseTo(PAD + b + 36, 6);

    const tall = paint(1, { aspect: 1, header: "h", title: "t", badge: "3" });

    expect(tall.drawn.at(-1)?.x).toBeCloseTo(PAD + 250 + 36, 6);
  });

  it("narrows the title: the same words get a smaller size beside a badge than without one", () => {
    const title = "alpha beta gamma";
    const plain = paint(2, { aspect: 2, header: "h", title });
    const badged = paint(2, { aspect: 2, header: "h", title, badge: "4" });
    // The badge's number is drawn before the title; the title's first line is the first thing drawn after the header that is not that number.
    const titleSize = (d: Drawn[]) =>
      sizeOf(
        d.filter((x) => x.text !== "4")[1] ?? {
          text: "",
          x: 0,
          y: 0,
          font: "",
        },
      );

    expect(titleSize(badged.drawn)).toBeLessThan(titleSize(plain.drawn));
  });

  it("draws the badge's number centred in it", () => {
    const { drawn: d } = paint(3, {
      aspect: 3,
      header: "h",
      title: "t",
      badge: "7",
    });
    const badge = d.find((x) => x.text === "7");

    expect(badge).toBeDefined();
    expect(badge?.x).toBeGreaterThan(PAD);
  });

  it("gives the title only what is left above the footer, and the whole body without one", () => {
    const without = paint(2, { aspect: 2, header: "h", title: "t" });
    const withFooter = paint(2, {
      aspect: 2,
      header: "h",
      title: "t",
      footer: "foot",
    });
    const bodyH = without.height - PAD - BAR_BOTTOM;
    const footH = Math.min(190, bodyH * 0.34);

    expect(without.drawn[1]?.y).toBeCloseTo(BAR_BOTTOM + bodyH / 2, 6);
    expect(withFooter.drawn[1]?.y).toBeCloseTo(
      BAR_BOTTOM + (bodyH - footH) / 2,
      6,
    );
  });

  it("draws the footer upper-case along the bottom, and 50 px when it can never fit", () => {
    const { height, drawn: d } = paint(2, {
      aspect: 2,
      header: "h",
      title: "t",
      footer: "done",
    });
    const bodyH = height - PAD - BAR_BOTTOM;
    const footH = Math.min(190, bodyH * 0.34);
    const foot = d.at(-1);

    expect(foot?.text).toBe("DONE");
    expect(foot?.y).toBeCloseTo(height - PAD - footH / 2, 6);

    const long = paint(2, {
      aspect: 2,
      header: "h",
      title: "t",
      footer: "word ".repeat(200),
    });

    expect(long.drawn.at(-1) ? sizeOf(long.drawn.at(-1) as Drawn) : 0).toBe(50);
  });
});
