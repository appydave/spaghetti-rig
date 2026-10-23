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
