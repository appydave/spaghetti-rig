// Word-wrapping and fitting text on a canvas (After-G04 A2c). One wrap serves the boss window face and the code window's prose; fit() sits beside
// it. Moved out of boss.ts and codewindow.ts as they were; this file holds no number but 0 and 1.

/** Break `text` into lines no wider than `width` (as measured with the context's current font), empty words dropped. */
export function wrap(
  g: CanvasRenderingContext2D,
  text: string,
  width: number,
): string[] {
  const out: string[] = [];
  let cur = "";

  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;

    if (g.measureText(next).width > width && cur) {
      out.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }

  if (cur) {
    out.push(cur);
  }

  return out;
}

/** How to fit some text: a font for a pixel size, the width and the number of lines it may take, and the sizes to try (from, down in steps, to `to`). */
export interface FitSpec {
  font: (px: number) => string;
  width: number;
  lines: number;
  from: number;
  to: number;
  step: number;
}

/** The biggest font size at which the text fits in `spec.lines` lines of `spec.width`. */
export function fit(g: CanvasRenderingContext2D, text: string, spec: FitSpec) {
  for (let px = spec.from; px > spec.to; px -= spec.step) {
    g.font = spec.font(px);

    const l = wrap(g, text, spec.width);

    if (
      l.length <= spec.lines &&
      l.every((x) => g.measureText(x).width <= spec.width)
    ) {
      return { px, lines: l };
    }
  }

  g.font = spec.font(spec.to);

  return {
    px: spec.to,
    lines: wrap(g, text, spec.width).slice(0, spec.lines),
  };
}
