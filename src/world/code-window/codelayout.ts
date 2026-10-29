import type { Block, Card, RowKind, View } from "#root/src/content/types.ts";
import {
  blankLine,
  codeLines,
  pushCaption,
  rowMarks,
  type RowContext,
} from "#root/src/world/code-window/layout/rows.ts";
import type { Layout, Line } from "#root/src/world/code-window/layout/types.ts";

/** The first plain label row of the first block names the file; a pinned row or an output row never does. */
function namesFile(kind: RowKind, view: View, pinned: boolean): boolean {
  return kind === "l" && view !== "output" && !pinned;
}

/** The step captions that sit above block `bi`. */
function pushStepCaptions(lines: Line[], ctx: RowContext, bi: number) {
  for (const s of ctx.card.steps ?? []) {
    if (s.block === bi) {
      pushCaption(lines, s.text, ctx.cols, bi);
    }
  }
}

/** One block as editor lines: its rule, its step captions, then its rows; the file name row is taken into `name`. */
function layoutBlock(
  ctx: RowContext,
  bi: number,
  block: Block,
  name: { value: string },
): Line[] {
  const lines: Line[] = [];

  if (bi > 0) {
    lines.push(blankLine("rule", block.view, bi));
  }

  pushStepCaptions(lines, ctx, bi);

  for (const [ri, [kind, text]] of block.rows.entries()) {
    const at = { block: bi, row: ri, view: block.view, kind, text };
    const marks = rowMarks(ctx, at);

    if (
      !name.value &&
      bi === 0 &&
      namesFile(kind, block.view, marks.length > 0)
    ) {
      name.value = text;
    } else {
      lines.push(...codeLines(ctx, at, marks));
    }
  }

  return lines;
}

/** Lay a card's blocks out as editor lines, wrapped to `cols`, with annotation marks and numbered pins. */
export function layoutCard(
  card: Card,
  cols: number,
  fallbackName: string,
): Layout {
  const lines: Line[] = [];
  const pinOf = new Map<object, number>();
  const name = { value: "" };

  for (const [i, a] of card.annotations.entries()) {
    pinOf.set(a, i + 1);
  }

  for (const s of card.steps ?? []) {
    if (s.block === null) {
      pushCaption(lines, s.text, cols);
    }
  }

  for (const [bi, block] of card.blocks.entries()) {
    lines.push(...layoutBlock({ card, pinOf, cols }, bi, block, name));
  }

  const notes = card.annotations.map((a, i) => ({
    pin: i + 1,
    kind: a.kind,
    note: a.note,
  }));

  return { lines, notes, cols, filename: name.value || fallbackName };
}
