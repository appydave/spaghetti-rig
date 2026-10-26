// What the street does that the world harness never plays: a tier with no boss. Uses the harness's stub canvas and the real content,
// so it runs the real PlayerWorld.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeCanvas } from "./recording-canvas";

(globalThis as any).document = {
  createElement: (tag: string) => (tag === "canvas" ? makeCanvas() : {}),
};

const { parseContent } = await import("../../src/content/load");
const { buildScript } = await import("../../src/show/script");
const { PlayerWorld } = await import("../../src/world/world");
const { initPhysics } = await import("../../src/world/physics");

await initPhysics();

const PAN = 0.25;
const cards = JSON.parse(
  readFileSync(
    new URL("../../public/content/cards.json", import.meta.url),
    "utf8",
  ),
);
const game = parseContent(cards);
const script = buildScript(game);
/** The same game with its first tier's boss taken away. */
const bossless = parseContent({
  ...cards,
  tiers: cards.tiers.map((t: any, i: number) =>
    i === 0 ? { ...t, boss: { ...t.boss, parts: [] } } : t,
  ),
});

const audio: any = { play: () => undefined };
const stepOf = (phase: string) => {
  const step = script.find((s) => s.tier === 0 && s.phase === phase);

  if (!step) {
    throw new Error(`no ${phase} step in tier 0`);
  }

  return step;
};

const worldOf = (g: typeof game): any => {
  const w: any = new PlayerWorld("p2", g, audio, () => PAN);

  w.settle(stepOf("vs"));

  return w;
};

/** How much city there is: the instances of everything built (the buildings and trees are instanced meshes). */
const cityInstances = (w: any): number => {
  let n = 0;

  w.street.city.traverse((o: any) => {
    n += o.isInstancedMesh ? o.count : 0;
  });

  return n;
};

describe("a tier with no boss", () => {
  it("shows no boss parts, and builds the buildings the boss arena would have cleared", () => {
    const withBoss = worldOf(game);
    const without = worldOf(bossless);

    expect(withBoss.bossTotal).toBeGreaterThan(0);
    expect(without.bossTotal).toBe(0);
    expect(without.bossLeft).toBe(0);
    expect(cityInstances(without)).toBeGreaterThan(cityInstances(withBoss));
  });
});
