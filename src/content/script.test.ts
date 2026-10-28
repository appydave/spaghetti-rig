import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseContent } from "#root/src/content/load.ts";
import {
  buildScript,
  healthAt,
  modeInfo,
  nextIndex,
  tierStart,
  toolsEarned,
} from "#root/src/content/script.ts";

const raw = JSON.parse(
  readFileSync(
    new URL("../../public/content/cards.json", import.meta.url),
    "utf8",
  ),
);
const game = parseContent(raw);
const script = buildScript(game);

describe("content", () => {
  it("every tier in the content file has stops, so none is locked", () => {
    expect(game.tiers.filter((t) => !t.playable)).toEqual([]);
  });

  it("locks a tier with no stops and keeps its boss name", () => {
    const bare = structuredClone(raw);

    bare.stops = bare.stops.filter(
      (s: { tier: string }) => s.tier !== "architecture",
    );

    const locked = parseContent(bare).tiers.filter((t) => !t.playable);

    expect(locked.map((t) => t.key)).toEqual(["architecture"]);
    for (const t of locked) {
      expect(t.boss.name).toBeTruthy();
    }
  });

  it("every stop has a problem card and a tool card with code", () => {
    for (const t of game.tiers) {
      for (const s of t.stops) {
        expect(s.p1.blocks.length).toBeGreaterThan(0);
        expect(s.p2.blocks.length).toBeGreaterThan(0);
      }
    }
  });

  it("a new stop or tier in the file shows up with no code change", () => {
    const extra = structuredClone(raw);

    extra.stops = extra.stops.filter(
      (s: { tier: string }) => s.tier !== "architecture",
    );
    extra.stops.push({
      ...structuredClone(raw.stops[0]),
      tier: "architecture",
      gate: "G13 · New gate",
    });

    const g = parseContent(extra);
    const arch = g.tiers.find((t) => t.key === "architecture")!;

    expect(arch.playable).toBe(true);
    expect(
      buildScript(g).some(
        (s) => s.tier === arch.index && s.phase === "problem",
      ),
    ).toBe(true);

    extra.tiers.push({
      n: 7,
      key: "seventh",
      name: "Seventh",
      boss: { name: "The new boss", parts: [] },
    });
    extra.stops.push({
      ...structuredClone(raw.stops[1]),
      tier: "seventh",
      gate: "G99 · Later",
    });

    const g2 = parseContent(extra);

    expect(g2.tiers.at(-1)!.playable).toBe(true);
    expect(
      buildScript(g2).filter((s) => s.tier === 6 && s.phase === "walk"),
    ).toHaveLength(1);
  });

  it("survives junk", () => {
    const g = parseContent({
      tiers: [{ key: "x" }],
      stops: [
        {
          tier: "x",
          p1: {
            blocks: [{ rows: [["c", "a"]] }],
            annotations: [{ block: 3, row: 9 }],
          },
        },
      ],
    });

    expect(g.tiers[0]!.playable).toBe(true);
    expect(g.tiers[0]!.stops[0]!.p1.annotations).toHaveLength(0);
    expect(buildScript(g).length).toBeGreaterThan(3);
    expect(() => buildScript(parseContent(null))).not.toThrow();
  });
});

describe("script", () => {
  it("opens on a VS screen and ends on the endings", () => {
    expect(script[0]!.phase).toBe("vs");
    expect(script.at(-1)!.phase).toBe("ending");
  });

  it("every playable tier has a VS screen to jump to", () => {
    for (const t of game.tiers.filter((x) => x.playable)) {
      expect(tierStart(script, t.index)).toBeGreaterThanOrEqual(0);
    }
  });

  it("player 1 mode skips the tool card steps", () => {
    const at = script.findIndex((s) => s.phase === "problem");
    const next = script[nextIndex(script, at, 1, "p1")]!;

    expect(next.phase).toBe("walk");
    expect(script[nextIndex(script, at, 1, "both")]!.phase).toBe("tool");
  });

  it("stays put at the ends", () => {
    expect(nextIndex(script, 0, -1, "both")).toBe(0);
    expect(nextIndex(script, script.length - 1, 1, "both")).toBe(
      script.length - 1,
    );
  });
});

describe("health", () => {
  const tier = game.tiers.find((t) => t.stops.length === 4)!;
  const steps = script.filter((s) => s.tier === tier.index);
  /** A negative wanted number matches any. */
  const matches = (want: number, got: number) => want < 0 || got === want;
  const at = (phase: string, stop = -1, part = -1) =>
    steps.find(
      (s) =>
        s.phase === phase && matches(stop, s.stop) && matches(part, s.part),
    )!;

  it("player 1 drops 90/n per stop and reaches the boss on 10%", () => {
    expect(healthAt(game, at("vs"), "p1")).toBe(100);
    expect(healthAt(game, at("problem", 0), "p1")).toBe(77.5);
    expect(healthAt(game, at("problem", 3), "p1")).toBe(10);
    expect(healthAt(game, at("boss"), "p1")).toBe(10);
    expect(healthAt(game, at("bossPart", -1, 0), "p1")).toBe(0);
  });

  it("player 2 is hit then fully healed by every tool card", () => {
    for (let k = 0; k < 4; k++) {
      expect(healthAt(game, at("problem", k), "p2")).toBe(77.5);
      expect(healthAt(game, at("fixed", k), "p2")).toBe(100);
    }

    expect(healthAt(game, at("bossDown"), "p2")).toBe(100);
  });

  it("three-stop tier: 100 → 70 → 40 → 10", () => {
    const three = game.tiers.find((t) => t.stops.length === 3)!;
    const p = script
      .filter((s) => s.tier === three.index && s.phase === "problem")
      .map((s) => healthAt(game, s, "p1"));

    expect(p).toEqual([70, 40, 10]);
  });

  it("player 2 earns one tool per fixed stop", () => {
    expect(toolsEarned(game, at("walk", 0))).toEqual([]);
    expect(toolsEarned(game, at("fixed", 0))).toEqual([tier.stops[0]!.p2.tool]);
    expect(toolsEarned(game, at("boss"))).toHaveLength(4);
  });
});

describe("missed enemies are debt, not damage", () => {
  // Recorded from the game before "bugs shipped" existed: health at every step of the show, [player 1, player 2].
  const baseline: [number, number][] = JSON.parse(
    readFileSync(new URL("./health.baseline.json", import.meta.url), "utf8"),
  );

  it("health at every step is unchanged", () => {
    // The baseline is tiers 1–5 and then the ending. Tier 6 came later, between them, and follows the same rule.
    const tiers1to5 = baseline.slice(0, -1);

    expect(
      script
        .slice(0, tiers1to5.length)
        .map((s) => [healthAt(game, s, "p1"), healthAt(game, s, "p2")]),
    ).toEqual(tiers1to5);

    const end = script.at(-1)!;

    expect(end.phase).toBe("ending");
    expect([healthAt(game, end, "p1"), healthAt(game, end, "p2")]).toEqual(
      baseline.at(-1),
    );

    const t6 = game.tiers.find((t) => t.key === "architecture")!;
    const seen = script
      .filter(
        (s) =>
          s.tier === t6.index && (s.phase === "vs" || s.phase === "problem"),
      )
      .map((s) => Math.round(healthAt(game, s, "p1")));

    expect(seen).toEqual([100, 70, 40, 10]);
  });

  it("player 1 still drops 100 → 78 → 55 → 33 → 10% across a four-stop tier", () => {
    const t = game.tiers.find((x) => x.stops.length === 4)!;
    const seen = script
      .filter(
        (s) =>
          s.tier === t.index && (s.phase === "vs" || s.phase === "problem"),
      )
      .map((s) => Math.round(healthAt(game, s, "p1")));

    expect(seen).toEqual([100, 78, 55, 33, 10]);
  });

  it("health is a function of the step alone: it takes no count of misses", () => {
    expect(healthAt.length).toBe(3);
  });
});

describe("modeInfo", () => {
  it("returns the labels for a known mode", () => {
    expect(modeInfo("spec").hud).toBe("YOU VS AUTOPILOT");
  });

  it("throws on a mode the list does not know", () => {
    expect(() => modeInfo(JSON.parse('"nope"'))).toThrow('Unknown mode "nope"');
  });
});
