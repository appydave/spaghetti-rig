// The game's colours. A literal colour anywhere else fails lint (strict-colors/no-color-literals): add it here, named for the role it
// plays, never for what it looks like. Colours that carry transparency are kept as the exact CSS strings the canvas is given.

export type Mood = "angry" | "calm" | "fixed" | "boss";

/** The dark ink the outlines and the badge text are drawn in. */
export const INK = "#173e35";

/** A code window's colours, by the mood of the card it shows. */
export const PALETTE: Record<
  Mood,
  {
    body: string;
    header: string;
    edge: string;
    side: string;
    label: string;
    title: string;
    output: string;
  }
> = {
  angry: {
    body: "#3a1b26",
    header: "#c4473f",
    edge: "#ff9f7f",
    side: "#7c2f33",
    label: "#ffb7a3",
    title: "#ffd96a",
    output: "#2c1520",
  },
  calm: {
    body: "#122d40",
    header: "#35556b",
    edge: "#8ebebf",
    side: "#547e92",
    label: "#9fc3d6",
    title: "#ffd96a",
    output: "#0d2333",
  },
  fixed: {
    body: "#122d40",
    header: "#35556b",
    edge: "#aee5a3",
    side: "#547e92",
    label: "#aee5a3",
    title: "#d6f5c9",
    output: "#0d2333",
  },
  boss: {
    body: "#2f202a",
    header: "#8b3329",
    edge: "#ffae59",
    side: "#e85b2b",
    label: "#ffae59",
    title: "#ffd96a",
    output: "#26161f",
  },
};

/** The underline or box drawn round a marked piece of code, by what the mark says. */
export const MARK = {
  problem: "#ff5d4f",
  fix: "#8ef08a",
  note: "#ffbf47",
  number: "#ffbf47",
};

/** The numbered pin beside a mark, by what the mark says. */
export const PIN = {
  problem: "#ff5d4f",
  fix: "#4fc46a",
  note: "#ffb52e",
  number: "#ffb52e",
};

/** An editor's syntax colours. */
export const SYNTAX = {
  text: "#d6e2f0",
  keyword: "#bd9bff",
  string: "#b7e994",
  number: "#ffbc79",
  comment: "#6889a6",
  punct: "#7da6c6",
  type: "#8fd3ff",
  fn: "#ffe08a",
};

/** The three dots in a code window's title bar. */
export const WINDOW_DOTS = ["#ff8b69", "#ffd96a", "#aee5a3"] as const;

/** Text and rules on a painted card (the card painter in codewindow.ts). */
export const CARD = {
  filename: "#f4f4e8",
  caption: "#f4f4e8",
  note: "#e6eef7",
  footerAngry: "#ffcdbd",
  footerCalm: "#b9d3e3",
  badgeAngry: "#de6a47",
  badgeCalm: "#f9db48",
  notesRule: "rgba(214,226,240,.22)",
  codeRule: "rgba(214,226,240,.25)",
  pinInk: "#0b1d29",
};

/** How a line of a diff, an output or a label is drawn. */
export const LINE = {
  addedTint: "rgba(126,220,140,.15)",
  removedTint: "rgba(222,106,71,.17)",
  addedSign: "#8ef08a",
  removedSign: "#ff7b6b",
  continuationArrow: "rgba(125,166,198,.5)",
  outputLabel: "#ffd96a",
  strikeThrough: "#ff6b5a",
  addedBoxOutline: "rgba(142,240,138,.75)",
  fixMarkFill: "rgba(142,240,138,.13)",
  labelLine: "#9fc3d6",
  outputOk: "#aee5a3",
  outputFail: "#ff9b8a",
  outputRemoved: "#f3b2a4",
};

/** The glass cracks: a dark wide stroke under a bright thin one, and the white dot where the glass was hit. */
export const CRACK = {
  shadow: "rgba(10,20,30,.55)",
  highlight: "rgba(240,250,255,.95)",
  impactDot: "rgba(255,255,255,.85)",
};

/** The white of an angry window's eyes. */
export const EYE_WHITE = "#fffdf0";

/** The neutral colour a window's slab sides are toon-shaded from. */
export const SLAB_TOON = "#fff";

/** The stage clears to this colour (fully transparent, so the page shows through). */
export const STAGE_CLEAR = 0x000000;

/** The effects pool's defaults (effects.ts): what a burst, ring, tracer, beam, flash or floating text is when no colour is given. */
export const FX = {
  muzzleLight: "#ffdc85",
  muzzle: "#ffdc85",
  spark: "#ffffff",
  burst: ["#fff3b0", "#f9db48", "#ffae59"],
  confetti: ["#f9db48", "#aee5a3", "#ff8b69", "#bd9bff", "#8ebebf", "#f4f4e8"],
  healSparkle: "#aee5a3",
  healSparkleAccent: "#f9db48",
  healRing: "#aee5a3",
  ring: "#f9db48",
  tracer: "#fff1a8",
  beam: "#aee5a3",
  beamCore: "#ffffff",
  text: "#f9db48",
  textOutline: "#173e35",
  glowCore: "rgba(255,255,255,1)",
  glowMid: "rgba(255,255,255,.8)",
  glowEdge: "rgba(255,255,255,0)",
  glowStar: "rgba(255,255,255,.9)",
};

/** A player lane's scene: the sky and fog, the sky light, the sun and the rim light. */
export const WORLD = {
  sky: "#b8d3c2",
  fog: "#c2d9c8",
  hemisphereSky: "#e4f7ff",
  hemisphereGround: "#586d55",
  sun: "#fff0c1",
  rim: "#93cfff",
};

/** The pile of spaghetti that is player 1's debt, with its meatballs, garnish and flag of surrender. */
export const PILE = {
  strandPale: "#f3d27a",
  strand: "#efc25e",
  meatball: "#de6a47",
  garnish: "#8b4a3a",
  flagPole: "#7a6e5e",
  flag: "#fffdf0",
};

/** What each thing that happens in a lane is coloured: its burst, ring, flash, beam or floating text. */
export const EVENT = {
  windowExitBurst: ["#aee5a3", "#f9db48"],
  hitBurst: ["#ff5d4f", "#ffae59", "#fff3b0"],
  hitRing: "#ff5d4f",
  hitText: "#ff8b69",
  toolMuzzle: "#aee5a3",
  toolRing: "#aee5a3",
  healText: "#aee5a3",
  bossArriveBurst: ["#ffae59", "#ff6d21", "#f4f4e8"],
  bossHitBurst: ["#ff5d4f", "#ffae59"],
  koText: "#ff5d4f",
  partMuzzle: "#f9db48",
  partBeam: "#f9db48",
  partBreakBurst: ["#f9db48", "#aee5a3", "#fff"],
  partText: "#f9db48",
  bossDownBurst: ["#f3d27a", "#de6a47"],
  bossDownBeam: "#f9db48",
  bossDownRing: "#f9db48",
  clearStreetBurst: ["#f4f4e8", "#aee5a3"],
  muzzleP1: "#ff9ad5",
  muzzleP2: "#ffdc85",
  tracerP1: "#ff9ad5",
  tracerP2: "#fff1a8",
  shotBurst: ["#f4f4e8"],
  bounceBurst: ["#ffffff", "#ffae59"],
  bounceRing: "#ffffff",
  bounceTracer: "#ffffff",
  noEffectText: "#ffffff",
  killSpaghettiBurst: ["#f3d27a", "#de6a47", "#fff3b0"],
  killBugBurst: ["#de6a47", "#173e35", "#f9db48"],
  killRobotBurst: ["#e0ebee", "#76e4f9", "#f8c355"],
  killRing: "#f9db48",
  killText: "#f9db48",
  shippedText: "#ff5d4f",
  caughtText: "#8ef08a",
};

/** The tool card in flight: the card, its border and words, and the light it throws. */
export const BOLT = {
  card: "#f9db48",
  border: "#173e35",
  text: "#173e35",
  light: "#f9db48",
};
