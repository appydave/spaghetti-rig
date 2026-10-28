import { context2d } from "#root/src/dom.ts";
import type { Layout } from "#root/src/world/code-window/codelayout.ts";
import {
  CODE_BOTTOM,
  lineHeight,
  measureCard,
  PAD,
  type Paint,
} from "#root/src/world/code-window/paint/card-measure.ts";
import {
  paintSlab,
  paintTitleBar,
} from "#root/src/world/code-window/paint/card-frame.ts";
import { drawLine } from "#root/src/world/code-window/paint/line-painter.ts";
import {
  paintFooter,
  paintHeading,
  paintNotes,
} from "#root/src/world/code-window/paint/card-text.ts";
import { PALETTE, type Mood } from "#root/src/world/palette.ts";

export type { Paint } from "#root/src/world/code-window/paint/card-measure.ts";

/** Paint a card as an editor window. The canvas size follows the content. */
export function paintCard(
  layout: Layout,
  mood: Mood,
  paint: Paint,
): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  const g = context2d(cv);
  const size = measureCard(g, layout, paint);
  const { width, height, cw, gutter, inner } = size;

  cv.width = width;
  cv.height = height;

  const p = PALETTE[mood];

  paintSlab(g, size, p);
  paintTitleBar(g, width, layout, p);

  let y = paintHeading(g, {
    width,
    mood,
    p,
    paint,
    titleLines: size.titleLines,
  });

  for (const line of layout.lines) {
    const h = lineHeight(line);

    drawLine(g, { line, x0: PAD, y, h, cw, gutter, inner, p });
    y += h;
  }

  y += CODE_BOTTOM;
  if (layout.notes.length) {
    y = paintNotes(g, y, {
      width,
      notes: layout.notes,
      noteLines: size.noteLines,
    });
  }

  paintFooter(g, y, mood, size.footLines);

  return cv;
}
