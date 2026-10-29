import rawSfx from "#root/src/audio/sfx.json";
import { expandSfx, parseSfx } from "#root/src/audio/sfx.ts";
import { bounce, robotBreak, shootP1 } from "#root/src/audio/sfx/bespoke.ts";
import type { SfxRig } from "#root/src/audio/sfx/rig.ts";

const RECIPES = parseSfx(rawSfx);

/** The effects still written as code rather than as data in sfx.json. */
const BESPOKE = new Map([
  ["shootP1", shootP1],
  ["robotBreak", robotBreak],
  ["bounce", bounce],
]);

/** Play one effect: its sfx.json layers in order, or else its own code. */
export function playRecipe(
  rig: SfxRig,
  out: AudioNode,
  sfx: string,
  t: number,
): void {
  const { voices } = rig;
  const layers = RECIPES.get(sfx);

  if (!layers) {
    BESPOKE.get(sfx)?.(rig, out, t);

    return;
  }

  for (const v of expandSfx(layers, t)) {
    switch (v.kind) {
      case "tone":
        voices.tone(out, v.at, v.opts);
        break;
      case "noise":
        voices.noise(out, v.at, v.opts);
        break;
      case "brass":
        voices.brass(out, v.at, v);
        break;
      case "trombone":
        voices.trombone(out, v.at, v);
        break;
    }
  }
}
