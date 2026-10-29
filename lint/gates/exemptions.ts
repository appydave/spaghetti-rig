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

/** The files carried to tier 5 (structure) by David's option 2, 10-24. Tier 5 split every one of them, so the list is empty, and it may never grow. */
export const CARRIED_TO_TIER_5: string[] = [];

/** The procedural-data file the duplicate gate (G08) skips: its two characters share a 9-line run of hand-placed body parts, which is data written as code. Every other model file scans clean; `gate.ts` shares `disposeTree` instead. */
export const DUPLICATES_PD = ["src/world/models/characters.ts"];

/** The leaf helper the coupling gate (G14) skips: `nth.ts` holds two ten-line guards, has no imports of its own and 31 importers, so its coupling is all fan-in. Exempt by name; the list is pinned and may never grow. */
export const COUPLING_EXEMPT = ["src/nth.ts"];

/**
 * The files the module-cohesion gate (G13) skips, by path and each with its reason; the list is pinned and may never grow. archlint 0.17.1 links two exports
 * only through a function's parameter or return type or one export calling another, so a field type inside an interface is invisible to it. A new `types.ts`
 * or `*-types.ts` file gets no pass: it must pass or be added here with a ruling.
 */
export const COHESION_EXEMPT = {
  "src/audio/types.ts":
    "type-only module: the audio contracts, linked by field types the tool cannot see",
  "src/content/types.ts":
    "type-only module: the content shapes, linked by field types the tool cannot see",
  "src/world/motion/city-layout-types.ts":
    "type-only module: the street layout, Placement used by SideLayout and CityLayout through field types",
  "src/world/palette.ts":
    "colour tables: one concern, a table per kind (Omer's *-settings case)",
  "src/world/motion/character-motion.ts":
    "one concern: Animated holds pose and motion through field types; every split moves a reader to more places (ruled 10-29, consults/2026-10-29-g13-b2-three-files.md)",
} satisfies Record<string, string>;
