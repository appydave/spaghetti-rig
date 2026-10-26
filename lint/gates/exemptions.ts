// The two lists the size and complexity gates both pin. One home, so the lists the tests state cannot drift apart.

/** The six model files that are asset data (hand-placed geometry and materials): exempt from the size rules for good. */
export const ASSET_DATA = [
  "src/world/boss.ts",
  "src/world/characters.ts",
  "src/world/city.ts",
  "src/world/enemies.ts",
  "src/world/gate.ts",
  "src/world/showcase.ts",
];

/** The files carried to tier 5 (structure) by David's option 2, 10-24: they still exceed a size limit and tier 5 splits them. The list may shrink, never grow. */
export const CARRIED_TO_TIER_5 = [
  "lint/gates/audio-proof.test.ts",
  "lint/gates/color-policy.mjs",
  "src/audio/audio.ts",
  "src/audio/tracks.ts",
  "src/content/load.ts",
  "src/main.ts",
  "src/show/director.ts",
  "src/show/script.ts",
  "src/world/codelayout.ts",
  "src/world/codewindow.ts",
  "src/world/effects.ts",
  "src/world/physics.ts",
  "src/world/toon.ts",
  "src/world/world.ts",
  "tests/show.spec.ts",
];
