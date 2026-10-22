import * as THREE from 'three';
import { CodeWindow } from './codewindow';
import { Debris } from './physics';
import { kit } from './toon';

/** The tier boss: a giant angry code window (the core) wearing one smaller window per sin. */
export class BossModel {
  readonly group = new THREE.Group();
  readonly core: CodeWindow;
  readonly parts: (CodeWindow | null)[];
  readonly glow = new THREE.PointLight('#ff6d21', 6, 18, 1.6);
  private readonly armour = new THREE.Group();
  private t = 0;
  shake = 0;

  constructor(coreCanvas: HTMLCanvasElement, partCanvases: HTMLCanvasElement[]) {
    this.group.name = 'tier-boss';
    this.core = new CodeWindow(coreCanvas, 10, 'boss', { maxHeight: 7.5, depth: 0.6 });
    this.core.group.position.set(0, 0, -0.6);
    this.group.add(this.core.group);
    const n = partCanvases.length;
    const cols = n <= 2 ? n : 2, rows = Math.ceil(n / cols);
    const cw = this.core.w, ch = this.core.h;
    this.parts = partCanvases.map((cv, i) => {
      const w = new CodeWindow(cv, Math.min(5.2, (cw * 0.98) / cols), 'boss', { maxHeight: (ch * 1.0) / rows, depth: 0.32 });
      const c = i % cols, r = Math.floor(i / cols);
      const x = cols === 1 ? 0 : (c - (cols - 1) / 2) * (cw / cols) * 1.02;
      const y = rows === 1 ? -ch * 0.08 : ((rows - 1) / 2 - r) * (ch / rows) * 0.98 - ch * 0.06;
      w.group.position.set(x + (Math.random() - 0.5) * 0.2, y, 0.25 + i * 0.05);
      w.group.rotation.z = (i % 2 ? 1 : -1) * 0.04;
      this.group.add(w.group);
      return w;
    });
    // Armour plates bolted round the core.
    const a = kit(0.03);
    for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
      const plate = a.soft(this.armour, '#e85b2b', x * (cw / 2 + 0.1), y * (ch / 2 + 0.1), -0.4, 1.4, 1.4, 0.9);
      plate.rotation.z = Math.PI / 4;
      a.ball(this.armour, '#ffae59', x * (cw / 2 + 0.1), y * (ch / 2 + 0.1), 0.1, 0.22);
    }
    for (const x of [-1, 1]) a.soft(this.armour, '#8b3329', x * (cw / 2 + 0.35), 0, -0.6, 0.6, ch * 0.7, 0.9);
    this.group.add(this.armour);
    this.glow.position.set(0, 0, 3);
    this.group.add(this.glow);
  }

  get remaining() { return this.parts.filter(Boolean).length; }

  /** Part i's centre in world space. */
  partWorld(i: number, out = new THREE.Vector3()) {
    const p = this.parts[i];
    return p ? p.group.getWorldPosition(out) : this.core.group.getWorldPosition(out);
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
    this.parts.forEach((_, i) => this.breakPart(i, debris, from));
    this.core.shatter(debris, from, 9, [7, 5], 99);
    debris.breakObject(this.armour, { from, power: 8, up: 6 });
    this.glow.removeFromParent();
    this.group.removeFromParent();
  }

  update(dt: number) {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const s = this.shake;
    this.group.children.forEach((c) => void c);
    this.core.group.position.y = Math.sin(this.t * 1.3) * 0.12;
    this.core.group.rotation.z = Math.sin(this.t * 0.9) * 0.02 + (Math.random() - 0.5) * s * 0.06;
    this.parts.forEach((p, i) => { if (p) { p.group.position.y += Math.sin(this.t * 2 + i) * 0.002; p.update(dt); } });
    this.core.update(dt);
    this.glow.intensity = 5 + Math.sin(this.t * 4) * 2 + s * 10;
  }

  dispose() {
    this.parts.forEach((p) => p?.dispose());
    this.core.dispose();
    this.armour.removeFromParent();
    this.group.removeFromParent();
  }
}
