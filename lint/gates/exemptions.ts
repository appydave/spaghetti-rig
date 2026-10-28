// The lists the gate tests pin: the size and complexity gates share two, the duplicate gate has its own. One home, so the lists the tests state cannot drift apart.

/** The six model files that are asset data (hand-placed geometry and materials): exempt from the size rules for good. */
export const ASSET_DATA = [
  "src/world/models/boss.ts",
  "src/world/models/characters.ts",
  "src/world/models/city.ts",
  "src/world/models/enemies.ts",
  "src/world/models/gate.ts",
  "src/world/models/showcase.ts",
];

/** The toon kit (R14, option A, 10-27): its part helpers take hand-placed positions and scales as separate numbers, so it is exempt from max-params by name. */
export const TOON_KIT = ["src/world/models/kit/kit.ts"];

/** The files carried to tier 5 (structure) by David's option 2, 10-24: they still exceed a size limit and tier 5 splits them. The list may shrink, never grow. */
export const CARRIED_TO_TIER_5 = ["lint/gates/audio-proof.test.ts"];

/** The procedural-data file the duplicate gate (G08) skips: its two characters share a 9-line run of hand-placed body parts, which is data written as code. Every other model file scans clean; `gate.ts` shares `disposeTree` instead. */
export const DUPLICATES_PD = ["src/world/models/characters.ts"];
