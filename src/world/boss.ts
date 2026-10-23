import * as THREE from "three";
import { bossLayout, type BossLayout } from "./bosslayout";
import { CodeWindow, PALETTE } from "./codewindow";
import { Debris } from "./physics";
import { geo, INK, kit } from "./toon";

const BARLOW = "Barlow, Impact, sans-serif",
  SPACE = "Space, Arial, sans-serif";

function wrap(
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
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

/** The biggest font size at which the text fits in `lines` lines of `width`. */
function fit(
  g: CanvasRenderingContext2D,
  text: string,
  font: (px: number) => string,
  width: number,
  lines: number,
  from: number,
  to: number,
) {
  for (let px = from; px > to; px -= 4) {
    g.font = font(px);
    const l = wrap(g, text, width);
    if (l.length <= lines && l.every((x) => g.measureText(x).width <= width))
      return { px, lines: l };
  }
  g.font = font(to);
  return { px: to, lines: wrap(g, text, width).slice(0, lines) };
}

/**
 * A boss window face: a few words, painted to fill the window so they read from the back of the room.
 * `aspect` is the window's width over height, so the words are laid out for the shape they will have.
 */
export function paintBossPanel(p: {
  aspect: number;
  header: string;
  title: string;
  footer?: string;
  badge?: string;
}): HTMLCanvasElement {
  const W = 1200,
    H = Math.round(W / p.aspect),
    PAD = 40,
    BAR = 150;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  const c = PALETTE.boss;
  g.fillStyle = c.body;
  g.beginPath();
  g.roundRect(0, 0, W, H, 40);
  g.fill();
  g.lineWidth = 16;
  g.strokeStyle = c.edge;
  g.beginPath();
  g.roundRect(8, 8, W - 16, H - 16, 34);
  g.stroke();
  g.save();
  g.beginPath();
  g.roundRect(16, 16, W - 32, BAR, 26);
  g.clip();
  g.fillStyle = c.header;
  g.fillRect(0, 0, W, BAR + 30);
  g.restore();
  g.textBaseline = "middle";
  for (const [i, col] of ["#ff8b69", "#ffd96a", "#aee5a3"].entries()) {
    g.fillStyle = col;
    g.beginPath();
    g.arc(66 + i * 50, 16 + BAR / 2, 17, 0, Math.PI * 2);
    g.fill();
  }
  const hx = 66 + 3 * 50;
  const head = fit(
    g,
    p.header.toUpperCase(),
    (px) => `700 ${px}px ${SPACE}`,
    W - hx - PAD,
    1,
    112,
    50,
  );
  g.fillStyle = "#fff1e0";
  g.fillText(head.lines[0] ?? "", hx, 16 + BAR / 2 + 3);
  // Body: optional number badge on the left, the title, then the footer line.
  const top = 16 + BAR + 18,
    bottom = H - PAD,
    bodyH = bottom - top;
  let left = PAD;
  if (p.badge) {
    const b = Math.min(250, bodyH * 0.62);
    g.fillStyle = "#ffd96a";
    g.beginPath();
    g.roundRect(PAD, top + (bodyH - b) / 2, b, b, 26);
    g.fill();
    g.fillStyle = INK;
    g.textAlign = "center";
    g.font = `italic 800 ${Math.round(b * 0.86)}px ${BARLOW}`;
    g.fillText(p.badge, PAD + b / 2, top + bodyH / 2 + b * 0.05);
    g.textAlign = "left";
    left = PAD + b + 36;
  }
  const footH = p.footer ? Math.min(190, bodyH * 0.34) : 0;
  const titleH = bodyH - footH;
  const width = W - left - PAD;
  let t = fit(
    g,
    p.title.toUpperCase(),
    (px) => `italic 800 ${px}px ${BARLOW}`,
    width,
    3,
    320,
    70,
  );
  while (t.px > 70 && t.lines.length * t.px * 0.9 > titleH)
    t = fit(
      g,
      p.title.toUpperCase(),
      (px) => `italic 800 ${px}px ${BARLOW}`,
      width,
      3,
      t.px - 4,
      70,
    );
  const lh = t.px * 0.9;
  let y = top + (titleH - lh * t.lines.length) / 2 + lh / 2;
  g.fillStyle = c.title;
  for (const line of t.lines) {
    g.fillText(line, left, y);
    y += lh;
  }
  if (p.footer) {
    const f = fit(
      g,
      p.footer.toUpperCase(),
      (px) => `italic 800 ${px}px ${BARLOW}`,
      width,
      1,
      Math.round(footH * 0.85),
      50,
    );
    g.fillStyle = "#ffae59";
    g.fillText(f.lines[0] ?? "", left, bottom - footH / 2);
  }
  return cv;
}

/**
 * The tier boss: an angry head on a giant code window (the core), with one window per sin
 * standing in columns either side. Each part stays in full view until it is knocked off.
 */
export class BossModel {
  readonly group = new THREE.Group();
  readonly core: CodeWindow;
  readonly parts: (CodeWindow | null)[];
  readonly head = new THREE.Group();
  readonly layout: BossLayout;
  readonly glow = new THREE.PointLight("#ff6d21", 6, 18, 1.6);
  private readonly frame = new THREE.Group();
  private readonly brows: THREE.Object3D[] = [];
  private readonly jaw = new THREE.Group();
  private readonly pupils: THREE.Object3D[] = [];
  private t = 0;
  shake = 0;

  constructor(
    coreCanvas: HTMLCanvasElement,
    partCanvases: HTMLCanvasElement[],
  ) {
    this.group.name = "tier-boss";
    const L = (this.layout = bossLayout(partCanvases.length));
    this.core = new CodeWindow(coreCanvas, L.core.w, "boss", {
      maxHeight: L.core.h,
      depth: 0.6,
      eyes: false,
    });
    this.group.add(this.core.group);
    this.parts = partCanvases.map((cv, i) => {
      const r = L.parts[i]!;
      const w = new CodeWindow(cv, r.w, "boss", {
        maxHeight: r.h,
        depth: 0.34,
        eyes: false,
      });
      w.group.position.set(r.x, r.y, 0.1);
      w.group.userData.home = w.group.position.clone();
      this.group.add(w.group);
      return w;
    });
    this.buildFrame();
    this.buildHead();
    this.glow.position.set(0, 0, 3);
    this.group.add(this.glow);
  }

  /** A dark chassis behind everything, so the windows read as one body with arms. */
  private buildFrame() {
    const a = kit(0.03),
      L = this.layout;
    a.soft(this.frame, "#5b2430", 0, 0, -0.55, L.width - 1.2, 1.1, 0.7);
    for (const p of L.parts) {
      a.soft(this.frame, "#8b3329", p.x, p.y, -0.42, 0.9, 0.9, 0.5);
      a.ball(this.frame, "#ffae59", p.x, p.y, -0.1, 0.18);
    }
    for (const s of [-1, 1])
      a.soft(
        this.frame,
        "#e85b2b",
        s * (L.core.w / 2 - 0.2),
        -L.core.h / 2 + 0.1,
        -0.35,
        1.0,
        1.0,
        0.8,
      );
    this.group.add(this.frame);
  }

  /** The face: chunky, angry, toy-like. */
  private buildHead() {
    const a = kit(0.035),
      H = this.layout.head,
      h = this.head;
    h.position.set(0, H.y, -0.25);
    a.soft(h, "#d24a3c", 0, 0, 0, H.w, H.h, 2.4);
    a.soft(h, "#a8352e", 0, -H.h * 0.36, 0.25, H.w * 0.92, H.h * 0.34, 2.1);
    // Horns.
    for (const s of [-1, 1]) {
      const horn = a.mesh(
        h,
        geo.cone,
        "#ffd96a",
        s * H.w * 0.36,
        H.h / 2 + 0.42,
        0,
        0.42,
        1.05,
        0.42,
      );
      horn.rotation.z = -s * 0.45;
    }
    // Eyes and furious brows.
    for (const s of [-1, 1]) {
      a.ball(h, "#fffdf0", s * H.w * 0.21, H.h * 0.1, 1.2, 0.62, 0.5, 0.3);
      const pupil = a.ball(
        h,
        INK,
        s * H.w * 0.18,
        H.h * 0.06,
        1.42,
        0.24,
        0.24,
        0.12,
        false,
      );
      this.pupils.push(pupil);
      a.ball(
        h,
        "#ffffff",
        s * H.w * 0.18 + 0.08,
        H.h * 0.12,
        1.5,
        0.07,
        0.07,
        0.04,
        false,
      );
      const brow = a.box(
        h,
        INK,
        s * H.w * 0.2,
        H.h * 0.36,
        1.25,
        1.25,
        0.3,
        0.3,
      );
      brow.rotation.z = s * -0.42;
      this.brows.push(brow);
    }
    // A wide grin full of jagged teeth.
    this.jaw.position.set(0, -H.h * 0.3, 1.2);
    a.soft(this.jaw, INK, 0, 0, 0, H.w * 0.62, 0.62, 0.3);
    const n = 6,
      tw = (H.w * 0.56) / n;
    for (let i = 0; i < n; i++) {
      const x = -H.w * 0.28 + tw * (i + 0.5);
      a.mesh(
        this.jaw,
        geo.cone,
        "#fffdf0",
        x,
        0.12,
        0.12,
        tw * 0.42,
        0.34,
        0.12,
      ).rotation.z = Math.PI;
      if (i % 2)
        a.mesh(
          this.jaw,
          geo.cone,
          "#fffdf0",
          x,
          -0.17,
          0.12,
          tw * 0.36,
          0.26,
          0.12,
        );
    }
    h.add(this.jaw);
    // Steam vents on the cheeks: it is very, very angry.
    for (const s of [-1, 1])
      a.cyl(
        h,
        "#ffae59",
        s * (H.w / 2 + 0.05),
        -0.1,
        0.4,
        0.22,
        0.3,
      ).rotation.z = Math.PI / 2;
    this.group.add(h);
  }

  get remaining() {
    return this.parts.filter(Boolean).length;
  }

  /** Part i's centre in world space. */
  partWorld(i: number, out = new THREE.Vector3()) {
    const p = this.parts[i];
    return p
      ? p.group.getWorldPosition(out)
      : this.core.group.getWorldPosition(out);
  }

  breakPart(i: number, debris: Debris, from: THREE.Vector3) {
    const p = this.parts[i];
    if (!p) return;
    p.shatter(debris, from, 7, [5, 4], 11 + i);
    this.parts[i] = null;
    this.shake = 1;
  }

  /** Remove a part without effects (when settling onto a later step). */
  dropPart(i: number) {
    const p = this.parts[i];
    if (!p) return;
    p.dispose();
    this.parts[i] = null;
  }

  destroy(debris: Debris, from: THREE.Vector3) {
    for (const i of this.parts.keys()) {
      this.breakPart(i, debris, from);
    }
    this.core.shatter(debris, from, 9, [7, 5], 99);
    debris.breakObject(this.frame, { from, power: 8, up: 6 });
    debris.breakObject(this.head, { from, power: 9, up: 8 });
    this.glow.removeFromParent();
    this.group.removeFromParent();
  }

  update(dt: number) {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const s = this.shake,
      t = this.t;
    this.core.group.position.y = Math.sin(t * 1.3) * 0.08;
    this.core.group.rotation.z = (Math.random() - 0.5) * s * 0.05;
    for (const [i, p] of this.parts.entries()) {
      if (!p) continue;
      const home = p.group.userData.home as THREE.Vector3;
      p.group.position.y = home.y + Math.sin(t * 2 + i) * 0.06;
      p.group.rotation.z = Math.sin(t * 1.4 + i * 2) * 0.025;
      p.update(dt);
    }
    this.core.update(dt);
    // The head bobs, chomps and scowls.
    this.head.position.y =
      this.layout.head.y +
      Math.sin(t * 2.2) * 0.1 +
      (Math.random() - 0.5) * s * 0.3;
    this.head.rotation.z =
      Math.sin(t * 1.1) * 0.05 + (Math.random() - 0.5) * s * 0.12;
    this.jaw.position.y =
      -this.layout.head.h * 0.3 - Math.max(0, Math.sin(t * 5)) * 0.12;
    for (const [i, b] of this.brows.entries()) {
      b.position.y =
        this.layout.head.h * 0.36 + Math.sin(t * 6 + i) * 0.03 - s * 0.1;
    }
    for (const [i, p] of this.pupils.entries()) {
      p.position.x =
        (i ? 1 : -1) * this.layout.head.w * 0.18 + Math.sin(t * 0.8) * 0.06;
    }
    this.glow.intensity = 5 + Math.sin(t * 4) * 2 + s * 10;
  }

  dispose() {
    for (const p of this.parts) {
      p?.dispose();
    }
    this.core.dispose();
    this.frame.removeFromParent();
    this.head.removeFromParent();
    this.group.removeFromParent();
  }
}
