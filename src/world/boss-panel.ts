// A boss window face (After-G04 A2c): a few words painted to fill the window so they read from the back of the room. Moved out of boss.ts as it
// was, split into its parts; every draw call is made in the same order. The numbers and colours are BOSS_PANEL in boss.ts (the model file).
import { context2d } from "#root/src/dom.ts";
import { fit } from "#root/src/world/canvas-text.ts";
import { PALETTE } from "#root/src/world/codewindow.ts";
import { INK } from "#root/src/world/toon.ts";

const BARLOW = "Barlow, Impact, sans-serif";
const SPACE = "Space, Arial, sans-serif";
const HEADER_FONT = (px: number) => `700 ${px}px ${SPACE}`;
const BODY_FONT = (px: number) => `italic 800 ${px}px ${BARLOW}`;

/** The words of a panel: its shape (the window's width over height), a header, a title, and optionally a footer and a number badge. */
export interface BossPanelText {
  aspect: number;
  header: string;
  title: string;
  footer?: string;
  badge?: string;
}

/** The numbers and colours of the panel: data only, read by paintBossPanel. */
export interface BossPanel {
  width: number;
  pad: number;
  bar: number;
  corner: number;
  edge: { width: number; inset: number; span: number; corner: number };
  head: {
    inset: number;
    span: number;
    corner: number;
    extra: number;
    nudge: number;
    color: string;
    font: { from: number; to: number; step: number };
  };
  dots: { colors: readonly string[]; x: number; step: number; radius: number };
  gap: number;
  badge: {
    max: number;
    share: number;
    corner: number;
    font: number;
    nudge: number;
    margin: number;
    color: string;
  };
  footer: {
    max: number;
    share: number;
    font: number;
    min: number;
    color: string;
  };
  title: {
    lines: number;
    from: number;
    to: number;
    step: number;
    leading: number;
  };
}

/** Paints one panel onto a canvas of its own. */
class Painter {
  private readonly g: CanvasRenderingContext2D;
  private readonly h: number;
  private readonly w: number;
  private readonly top: number;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly k: BossPanel,
    aspect: number,
  ) {
    this.w = k.width;
    this.h = Math.round(this.w / aspect);
    canvas.width = this.w;
    canvas.height = this.h;
    this.g = context2d(canvas);
    this.top = k.head.inset + k.bar + k.gap;
  }

  /** The rounded body, its edge, and the header bar with its three dots. */
  frame() {
    const { g, k, w, h } = this;
    const c = PALETTE.boss;

    g.fillStyle = c.body;
    g.beginPath();
    g.roundRect(0, 0, w, h, k.corner);
    g.fill();
    g.lineWidth = k.edge.width;
    g.strokeStyle = c.edge;
    g.beginPath();
    g.roundRect(
      k.edge.inset,
      k.edge.inset,
      w - k.edge.span,
      h - k.edge.span,
      k.edge.corner,
    );
    g.stroke();
    g.save();
    g.beginPath();
    g.roundRect(
      k.head.inset,
      k.head.inset,
      w - k.head.span,
      k.bar,
      k.head.corner,
    );
    g.clip();
    g.fillStyle = c.header;
    g.fillRect(0, 0, w, k.bar + k.head.extra);
    g.restore();
    g.textBaseline = "middle";
    for (const [i, col] of k.dots.colors.entries()) {
      g.fillStyle = col;
      g.beginPath();
      g.arc(
        k.dots.x + i * k.dots.step,
        this.barMiddle(),
        k.dots.radius,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
  }

  private barMiddle() {
    return this.k.head.inset + this.k.bar / 2;
  }

  /** The header words, in the bar to the right of the dots. */
  header(text: string) {
    const { g, k } = this;
    const x = k.dots.x + k.dots.colors.length * k.dots.step;
    const spec = {
      font: HEADER_FONT,
      width: this.w - x - k.pad,
      lines: 1,
      ...k.head.font,
    };
    const head = fit(g, text.toUpperCase(), spec);

    g.fillStyle = k.head.color;
    g.fillText(head.lines[0] ?? "", x, this.barMiddle() + k.head.nudge);
  }

  /** The number badge on the left of the body; the x the words start at. */
  badge(text: string | undefined, bodyH: number): number {
    const { g, k } = this;

    if (!text) {
      return k.pad;
    }

    const b = Math.min(k.badge.max, bodyH * k.badge.share);

    g.fillStyle = k.badge.color;
    g.beginPath();
    g.roundRect(k.pad, this.top + (bodyH - b) / 2, b, b, k.badge.corner);
    g.fill();
    g.fillStyle = INK;
    g.textAlign = "center";
    g.font = `italic 800 ${Math.round(b * k.badge.font)}px ${BARLOW}`;
    g.fillText(text, k.pad + b / 2, this.top + bodyH / 2 + b * k.badge.nudge);
    g.textAlign = "left";

    return k.pad + b + k.badge.margin;
  }

  /** The title, the biggest that fits in its lines and its height, centred in the space above the footer. */
  title(text: string, left: number, titleH: number) {
    const { g, k } = this;
    const width = this.w - left - k.pad;
    const spec = { font: BODY_FONT, width, ...k.title };
    let t = fit(g, text.toUpperCase(), spec);

    while (
      t.px > k.title.to &&
      t.lines.length * t.px * k.title.leading > titleH
    ) {
      t = fit(g, text.toUpperCase(), { ...spec, from: t.px - k.title.step });
    }

    const lh = t.px * k.title.leading;
    let y = this.top + (titleH - lh * t.lines.length) / 2 + lh / 2;

    g.fillStyle = PALETTE.boss.title;
    for (const line of t.lines) {
      g.fillText(line, left, y);
      y += lh;
    }
  }

  /** The footer line along the bottom. */
  footer(text: string, left: number, footH: number) {
    const { g, k } = this;
    const spec = {
      font: BODY_FONT,
      width: this.w - left - k.pad,
      lines: 1,
      from: Math.round(footH * k.footer.font),
      to: k.footer.min,
      step: k.title.step,
    };
    const f = fit(g, text.toUpperCase(), spec);

    g.fillStyle = k.footer.color;
    g.fillText(f.lines[0] ?? "", left, this.h - k.pad - footH / 2);
  }

  /** The room the body has between the header bar and the bottom padding. */
  bodyHeight() {
    return this.h - this.k.pad - this.top;
  }
}

/** Paint a panel with the given numbers and colours. */
export function paintPanel(p: BossPanelText, k: BossPanel): HTMLCanvasElement {
  const painter = new Painter(document.createElement("canvas"), k, p.aspect);
  const bodyH = painter.bodyHeight();

  painter.frame();
  painter.header(p.header);

  const left = painter.badge(p.badge, bodyH);
  const footH = p.footer ? Math.min(k.footer.max, bodyH * k.footer.share) : 0;

  painter.title(p.title, left, bodyH - footH);
  if (p.footer) {
    painter.footer(p.footer, left, footH);
  }

  return painter.canvas;
}
