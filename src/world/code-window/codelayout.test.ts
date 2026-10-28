import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseContent } from "#root/src/content/load.ts";
import {
  layoutCard,
  tokenize,
  wrapPoints,
  SYNTAX,
} from "#root/src/world/code-window/codelayout.ts";

const game = parseContent(
  JSON.parse(
    readFileSync(
      new URL("../../../public/content/cards.json", import.meta.url),
      "utf8",
    ),
  ),
);
const stops = game.tiers.flatMap((t) => t.stops);

/** One card at one width: every annotation is pinned once, every code line keeps its text, and every annotation has a note. */
function expectLaidOut(card: (typeof stops)[number]["p1"], cols: number) {
  const l = layoutCard(card, cols, "x.ts");
  const pins = l.lines
    .flatMap((x) => x.marks.map((m) => m.pin))
    .filter((p) => p > 0);

  expect(new Set(pins).size, `${card.id} @${cols}`).toBe(
    card.annotations.length,
  );
  for (const line of l.lines) {
    expect(line.tokens.map((t) => t.text).join("")).toBe(
      line.type === "code" ? line.text : "",
    );
  }

  expect(l.notes).toHaveLength(card.annotations.length);
}

describe("code layout", () => {
  it("colours keywords, strings and numbers", () => {
    const t = tokenize('const a = "x"; // hi 42', "code", "c");

    expect(t.find((x) => x.text === "const")?.color).toBe(SYNTAX.keyword);
    expect(t.find((x) => x.text.includes('"x"'))?.color).toBe(SYNTAX.string);
    expect(t.at(-1)!.color).toBe(SYNTAX.comment);
  });

  it("wraps long rows within the width and keeps every character", () => {
    const s =
      "socket.on(FLEET_EVENTS.HISTORY, guarded(SeatHistorySchema, (data) => opts.store.putHistory(data)));";
    const cuts = wrapPoints(s, 40, 4);

    expect(cuts.length).toBeGreaterThan(2);

    const pieces = cuts.map((c, i) => s.slice(c, cuts[i + 1] ?? s.length));

    expect(pieces.join("")).toBe(s);
    for (const p of pieces) {
      expect(p.length).toBeLessThanOrEqual(40);
    }
  });

  it("lays out every card with every annotation pinned exactly once", () => {
    for (const s of stops) {
      for (const card of [s.p1, s.p2]) {
        for (const cols of [40, 56, 72]) {
          expectLaidOut(card, cols);
        }
      }
    }
  });

  it("uses a diff label as the window filename", () => {
    const prettier = stops.find((s) => s.p2.tool === "prettier")!;

    expect(layoutCard(prettier.p2, 56, "x.ts").filename).toBe(
      "server/src/rigs.ts",
    );
  });
});
