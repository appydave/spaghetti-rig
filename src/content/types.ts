/** Shapes of public/content/cards.json. Only the fields the game reads are typed; the rest pass through. */

export type RowKind = "c" | "a" | "d" | "l";
export type Row = [RowKind, string];
export type View = "code" | "diff" | "output";
export type AnnotationKind = "problem" | "fix" | "note" | "number";

export interface Block {
  view: View;
  rows: Row[];
}
export interface Annotation {
  block: number;
  row: number;
  match: string;
  kind: AnnotationKind;
  note: string;
}
export interface FailureMode {
  input: string;
  where: string;
  result: string;
}
export interface Evidence {
  status: string;
  source?: string;
}
export interface Step {
  text: string;
  block: number | null;
}

export interface Card {
  id: string;
  title: string;
  blocks: Block[];
  annotations: Annotation[];
  text?: string;
  say?: string;
  presenter?: string[];
  failureModes?: FailureMode[];
  evidence?: Evidence;
  num?: string;
  tool?: string;
  showConfig?: boolean;
  steps?: Step[];
  answers?: string;
}

export interface Stop {
  tier: string;
  gate: string;
  p1: Card;
  p2: Card;
}

export interface BossPart {
  part: string;
  from: string;
  beatenBy: string;
}
export interface Boss {
  id: string | null;
  name: string;
  idea?: string;
  attack?: string;
  p1?: string;
  p2?: string;
  say?: string;
  presenter?: string[];
  parts: BossPart[];
  playable?: boolean;
}

export interface Tier {
  n: number;
  key: string;
  name: string;
  gates?: string;
  idea?: string;
  boss: Boss;
}

export interface ToolConfig {
  file: string;
  status?: string;
  source?: string;
  lines: [string, string][];
}
export interface Tool {
  name: string;
  what?: string;
  why?: string;
  how?: string;
  config?: ToolConfig;
}

export interface Ending {
  id?: string;
  big: string;
  sub: string;
}

export interface Content {
  screens: {
    title: { big: string; sub: string };
    vs: { p1: string; p2: string };
  };
  tiers: Tier[];
  tools: Record<string, Tool>;
  stops: Stop[];
  endings: { p1: Ending; p2: Ending };
}
