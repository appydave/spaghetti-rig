// Hand-placed model geometry and materials: asset data, exempt from the magic-number and colour gates (R7 revised, David 2026-10-23).
import * as THREE from "three";
import { bossLayout, type BossLayout } from "./bosslayout";
import { paintPanel, type BossPanel, type BossPanelText } from "./boss-panel";
import { CodeWindow } from "./codewindow";
import { Debris } from "./physics";
import { geo, INK, kit } from "./toon";
import { userData } from "./objects";
import { nth } from "../nth";

/** The numbers and colours of a boss window face: data only, read by paintPanel in boss-panel.ts. */
const BOSS_PANEL = {
  half: 0.5,
  turn: 2,
  width: 1200,
  pad: 40,
  bar: 150,
  corner: 40,
  edge: { width: 16, inset: 8, span: 16, corner: 34 },
  head: {
    inset: 16,
    span: 32,
    corner: 26,
    extra: 30,
    nudge: 3,
    color: "#fff1e0",
    font: { from: 112, to: 50, step: 4 },
  },
  dots: {
    colors: ["#ff8b69", "#ffd96a", "#aee5a3"],
    x: 66,
    step: 50,
    radius: 17,
  },
  gap: 18,
  badge: {
    max: 250,
    share: 0.62,
    corner: 26,
    font: 0.86,
    nudge: 0.05,
    margin: 36,
    color: "#ffd96a",
  },
  footer: { max: 190, share: 0.34, font: 0.85, min: 50, color: "#ffae59" },
  title: { lines: 3, from: 320, to: 70, step: 4, leading: 0.9 },
} as const satisfies BossPanel;

/**
 * A boss window face: a few words, painted to fill the window so they read from the back of the room.
 * `aspect` is the window's width over height, so the words are laid out for the shape they will have.
 */
export const paintBossPanel = (p: BossPanelText) => paintPanel(p, BOSS_PANEL);

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
      const r = nth(L.parts, i, "boss layout parts");
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
    const a = kit(0.03);
    const L = this.layout;

    a.soft(this.frame, "#5b2430", 0, 0, -0.55, L.width - 1.2, 1.1, 0.7);
    for (const p of L.parts) {
      a.soft(this.frame, "#8b3329", p.x, p.y, -0.42, 0.9, 0.9, 0.5);
      a.ball(this.frame, "#ffae59", p.x, p.y, -0.1, 0.18);
    }

    for (const s of [-1, 1]) {
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
    }

    this.group.add(this.frame);
  }

  /** The face: chunky, angry, toy-like. */
  private buildHead() {
    const a = kit(0.035);
    const H = this.layout.head;
    const h = this.head;

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

    const n = 6;
    const tw = (H.w * 0.56) / n;

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
      if (i % 2) {
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
    }

    h.add(this.jaw);
    // Steam vents on the cheeks: it is very, very angry.
    for (const s of [-1, 1]) {
      a.cyl(
        h,
        "#ffae59",
        s * (H.w / 2 + 0.05),
        -0.1,
        0.4,
        0.22,
        0.3,
      ).rotation.z = Math.PI / 2;
    }

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

    if (!p) {
      return;
    }

    p.shatter(debris, from, 7, [5, 4], 11 + i);
    this.parts[i] = null;
    this.shake = 1;
  }

  /** Remove a part without effects (when settling onto a later step). */
  dropPart(i: number) {
    const p = this.parts[i];

    if (!p) {
      return;
    }

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

    const s = this.shake;
    const t = this.t;

    this.core.group.position.y = Math.sin(t * 1.3) * 0.08;
    this.core.group.rotation.z = (Math.random() - 0.5) * s * 0.05;
    for (const [i, p] of this.parts.entries()) {
      if (!p) {
        continue;
      }

      const home = userData(p.group, "home", THREE.Vector3);

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
