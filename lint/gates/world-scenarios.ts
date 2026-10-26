// The scenarios the world harness plays (G04 H1k-a): a player, a tier and how the world is played. Moved out of world-proof.test.ts as it
// was, so the harness can grow without that file passing 300 lines.
export type Mode = "watch" | "autoplay" | "pointer" | "jump" | "skip" | "tour";
export type Scenario = {
  player: "p1" | "p2";
  tier: number;
  mode: Mode;
  seed: number;
  tall?: boolean;
  /** Resize the window at every third look, so it lands mid-step with a window and a boss up: "flip" between wide and tall, "same" between two talls (the boss stands further back the narrower the screen). */
  resize?: "flip" | "same";
  /** The tiers to visit, in order, in one world (default: just `tier`). */
  visit?: number[];
  /** After each tier's steps, take them again last to first (a presenter paging back). */
  andBack?: boolean;
  /** Leave the first tier after this many steps and go on to the next in the same world: a jump out of the middle of a tier, with its window, debt and boss still up. */
  cutAt?: number;
  /** Play the last step before the cut for this many frames, on autoplay, so a walk has its enemies on the road and its effects up when the world jumps to the next tier. */
  lingerFrames?: number;
};

export type Named = [string, () => string[]];
type Namer = (what: string, s: Scenario) => Named;

/** Each way of playing gets its own run of seeds, so no two scenarios share a random stream. */
const AUTOPLAY_SEEDS = 10;
const POINTER_SEEDS = 20;
const JUMP_SEEDS = 30;
const SKIP_SEEDS = 40;
const RESIZE_SEEDS = 50;
const TOUR_SEEDS = 60;
const MIDWALK_SEEDS = 80;
const PAGES_BACK_SEEDS = 70;
/** How many of tier 0's steps are played before a tour cuts to tier 1, each ending where something is still up in the world. */
const AFTER_FIRST_WALK = 2; // the walk to the first stop begun
const AFTER_FIRST_TOOL = 4; // the stop window up
const AFTER_LAST_FIX = 17; // the window up and the debt trailing
const AFTER_LAST_WALK = 18; // the walk to the boss just begun
const AFTER_SECOND_BOSS_PART = 21; // the boss up with parts knocked off
/** Tier 0's walks to its first stop and to its boss, played this long before the cut, when the street has enemies on it. */
const MIDWALK_CUTS = [AFTER_FIRST_WALK, AFTER_LAST_WALK];
const MIDWALK_FRAMES = 95;
const CUT_STEPS = [
  AFTER_FIRST_TOOL,
  AFTER_LAST_FIX,
  AFTER_LAST_WALK,
  AFTER_SECOND_BOSS_PART,
];
/** The slower ways of playing are run on the tiers up to this one. */
const LAST_FULL_TIER = 1;
const TALL_SEED = 7;

/** One player's scenarios on one tier. */
function onTier(named: Namer, player: "p1" | "p2", tier: number): Named[] {
  const base = { player, tier };
  const watch = named("watches", { ...base, mode: "watch", seed: tier });

  if (tier > LAST_FULL_TIER) {
    return [watch];
  }

  return [
    watch,
    named("on autoplay", {
      ...base,
      mode: "autoplay",
      seed: tier + AUTOPLAY_SEEDS,
    }),
    named("clicks with the pointer", {
      ...base,
      mode: "pointer",
      seed: tier + POINTER_SEEDS,
    }),
    named("jumps about", {
      ...base,
      mode: "jump",
      seed: tier + JUMP_SEEDS,
    }),
    named("skips through", {
      ...base,
      mode: "skip",
      seed: tier + SKIP_SEEDS,
    }),
  ];
}

/** The resizing scenarios and the one on a tall screen. */
function onScreens(named: Namer, tiers: { index: number }[]): Named[] {
  return [
    ...tiers.flatMap((t) =>
      (["flip", "same"] as const).map((resize) =>
        named(`resizes mid-play (${resize})`, {
          player: "p1",
          tier: t.index,
          mode: "watch",
          seed: t.index + RESIZE_SEEDS,
          tall: resize === "same",
          resize,
        }),
      ),
    ),
    named("on a tall screen", {
      player: "p2",
      tier: 0,
      mode: "watch",
      seed: TALL_SEED,
      tall: true,
    }),
  ];
}

/** Tours across tiers and back, and a tier paged back through: a tier change, and a world stepped backwards, in one world. */
function onTours(named: Namer): Named[] {
  return (["p1", "p2"] as const).flatMap((player) => [
    named("tours tiers 0, 1, 0", {
      player,
      tier: 0,
      mode: "tour",
      seed: TOUR_SEEDS,
      visit: [0, 1, 0],
    }),
    ...CUT_STEPS.map((cutAt) =>
      named(`cuts from step ${cutAt} to tier 1`, {
        player,
        tier: 0,
        mode: "tour",
        seed: cutAt + TOUR_SEEDS,
        visit: [0, 1],
        cutAt,
      }),
    ),
    ...MIDWALK_CUTS.map((cutAt) =>
      named(`cuts from mid-walk, step ${cutAt}, to tier 1`, {
        player,
        tier: 0,
        mode: "tour",
        seed: cutAt + MIDWALK_SEEDS,
        visit: [0, 1],
        cutAt,
        lingerFrames: MIDWALK_FRAMES,
      }),
    ),
    ...[0, 1].map((tier) =>
      named("pages back through the tier", {
        player,
        tier,
        mode: "tour",
        seed: tier + PAGES_BACK_SEEDS,
        andBack: true,
      }),
    ),
  ]);
}

/** Every scenario, each named and ready to run with the given play function. */
export function scenarioList(
  tiers: { index: number }[],
  play: (s: Scenario) => string[],
): Named[] {
  const named: Namer = (what, s) => [
    `${s.player} ${what}, tier ${s.tier}`,
    () => play(s),
  ];

  return [
    ...tiers.flatMap((t) =>
      (["p1", "p2"] as const).flatMap((player) =>
        onTier(named, player, t.index),
      ),
    ),
    ...onScreens(named, tiers),
    ...onTours(named),
  ];
}
