// Settling a fresh world straight onto the last steps of a tier (the boss beaten, the result, the ending) must not throw: the camera frames
// the boss there, so the boss layout has to exist even though no boss model is on the street. (Found by orch-architect, 2026-10-25.)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canvasDocument } from "./recording-canvas";
import { loadWorld } from "./support/world-boot";

(globalThis as any).document = canvasDocument();

const { parseContent, buildScript, PlayerWorld } = await loadWorld();

const PAN = 0.25;
const game = parseContent(
  JSON.parse(
    readFileSync(
      new URL("../../public/content/cards.json", import.meta.url),
      "utf8",
    ),
  ),
);
const script = buildScript(game);
const audio: any = { play: () => undefined };

describe("settling a fresh world on the last steps of a tier", () => {
  const lastSteps = script.filter((s) =>
    ["bossDown", "result", "ending"].includes(s.phase),
  );

  it("has last steps to settle on", () => {
    expect(lastSteps.length).toBeGreaterThan(0);
  });

  for (const player of ["p1", "p2"]) {
    for (const step of lastSteps) {
      it(`${player} settles on tier ${step.tier} ${step.phase}${step.stop}.${step.part} and snaps the camera`, () => {
        const w: any = new PlayerWorld(player, game, audio, () => PAN);

        w.setAspect(16 / 9);
        w.settle(step);
        expect(() => w.snapCamera()).not.toThrow();
      });
    }
  }
});
