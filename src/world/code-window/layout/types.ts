import type { AnnotationKind, RowKind, View } from "#root/src/content/types.ts";

export interface Token {
  text: string;
  color: string;
}
export interface Mark {
  from: number;
  to: number;
  kind: AnnotationKind;
  pin: number;
  whole: boolean;
}
export interface Line {
  type: "code" | "caption" | "gap" | "rule";
  view: View;
  diff: RowKind;
  text: string;
  tokens: Token[];
  marks: Mark[];
  /** Wrapped continuation of the row above. */
  cont: boolean;
  /** Index of the source block and row (for effects that point at a line). */
  block: number;
  row: number;
}
export interface Layout {
  lines: Line[];
  notes: { pin: number; kind: AnnotationKind; note: string }[];
  cols: number;
  filename: string;
}
