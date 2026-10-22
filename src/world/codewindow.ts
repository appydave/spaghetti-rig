import * as THREE from 'three';
import type { Layout, Line, Mark } from './codelayout';
import { Debris } from './physics';
import { INK, kit, rng, toon } from './toon';

export type Mood = 'angry' | 'calm' | 'fixed' | 'boss';

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const FONT = 34, LH = 50, PAD = 44, HEADER = 74;

export const PALETTE: Record<Mood, { body: string; header: string; edge: string; side: string; label: string; title: string; output: string }> = {
  angry: { body: '#3a1b26', header: '#c4473f', edge: '#ff9f7f', side: '#7c2f33', label: '#ffb7a3', title: '#ffd96a', output: '#2c1520' },
  calm: { body: '#122d40', header: '#35556b', edge: '#8ebebf', side: '#547e92', label: '#9fc3d6', title: '#ffd96a', output: '#0d2333' },
  fixed: { body: '#122d40', header: '#35556b', edge: '#aee5a3', side: '#547e92', label: '#aee5a3', title: '#d6f5c9', output: '#0d2333' },
  boss: { body: '#2f202a', header: '#8b3329', edge: '#ffae59', side: '#e85b2b', label: '#ffae59', title: '#ffd96a', output: '#26161f' },
};
const MARK = { problem: '#ff5d4f', fix: '#8ef08a', note: '#ffbf47', number: '#ffbf47' };
const PIN = { problem: '#ff5d4f', fix: '#4fc46a', note: '#ffb52e', number: '#ffb52e' };

export interface Paint { label: string; title: string; footer?: string; badge?: string }

function wrapProse(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    const next = cur ? `${cur} ${w}` : w;
    if (g.measureText(next).width > width && cur) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
}

/** Paint a card as an editor window. The canvas size follows the content. */
export function paintCard(layout: Layout, mood: Mood, paint: Paint): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d')!;
  g.font = `600 ${FONT}px ${MONO}`;
  const cw = g.measureText('MMMMMMMMMM').width / 10;
  const gutter = cw * 2.2;
  const width = Math.ceil(PAD * 2 + gutter + layout.cols * cw);
  const inner = width - PAD * 2;

  // Measure everything first.
  g.font = `italic 800 66px Barlow, Impact, sans-serif`;
  const titleLines = wrapProse(g, paint.title.toUpperCase(), inner - (paint.badge ? 140 : 0));
  g.font = `500 30px Space, Arial, sans-serif`;
  const noteLines = layout.notes.map((n) => wrapProse(g, n.note, inner - 64));
  g.font = `500 28px Space, Arial, sans-serif`;
  const footLines = paint.footer ? wrapProse(g, paint.footer, inner) : [];
  const lineH = (l: Line) => (l.type === 'rule' ? 34 : l.type === 'caption' ? 44 : LH);
  const titleH = 40 + titleLines.length * 62 + 18;
  const codeH = layout.lines.reduce((s, l) => s + lineH(l), 0) + 24;
  const notesH = layout.notes.length ? 26 + noteLines.reduce((s, l) => s + Math.max(1, l.length) * 40 + 8, 0) : 0;
  const footH = footLines.length ? 18 + footLines.length * 38 : 0;
  const height = Math.ceil(HEADER + titleH + codeH + notesH + footH + PAD * 0.8);
  cv.width = width; cv.height = height;
  const p = PALETTE[mood];

  // Body with a bright inner edge (the slab's front lip).
  g.fillStyle = p.body; roundRect(g, 0, 0, width, height, 30); g.fill();
  g.lineWidth = 10; g.strokeStyle = p.edge; roundRect(g, 5, 5, width - 10, height - 10, 26); g.stroke();
  // Title bar.
  g.save(); roundRect(g, 10, 10, width - 20, HEADER - 4, 22); g.clip();
  g.fillStyle = p.header; g.fillRect(0, 0, width, HEADER + 10);
  g.restore();
  ['#ff8b69', '#ffd96a', '#aee5a3'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(46 + i * 34, HEADER / 2 + 4, 11, 0, Math.PI * 2); g.fill(); });
  g.font = `600 28px ${MONO}`; g.fillStyle = '#f4f4e8'; g.textBaseline = 'middle';
  const fname = layout.filename.length > layout.cols - 8 ? '…' + layout.filename.slice(-(layout.cols - 9)) : layout.filename;
  g.fillText(fname, 46 + 3 * 34 + 8, HEADER / 2 + 5);

  let y = HEADER + 40;
  g.textBaseline = 'alphabetic';
  g.font = `600 22px Space, Arial, sans-serif`; g.fillStyle = p.label;
  spaced(g, paint.label.toUpperCase(), PAD, y, 4);
  if (paint.badge) {
    g.font = `italic 800 40px Barlow, Impact, sans-serif`;
    const bw = g.measureText(paint.badge).width + 34;
    g.fillStyle = mood === 'angry' ? '#de6a47' : '#f9db48';
    roundRect(g, width - PAD - bw, y - 30, bw, 58, 8); g.fill();
    g.fillStyle = INK; g.fillText(paint.badge, width - PAD - bw + 17, y + 12);
  }
  g.font = `italic 800 66px Barlow, Impact, sans-serif`; g.fillStyle = p.title;
  for (const t of titleLines) { y += 62; g.fillText(t, PAD, y); }
  y += 18;

  // Code.
  const top = y;
  for (const line of layout.lines) {
    const h = lineH(line);
    drawLine(g, line, PAD, y, h, cw, gutter, inner, p);
    y += h;
  }
  y += 24;
  // Output blocks get their own darker panel drawn underneath; re-tint by redrawing behind is costly, so it's inline above.
  void top;

  if (layout.notes.length) {
    g.strokeStyle = 'rgba(214,226,240,.22)'; g.lineWidth = 2; g.setLineDash([8, 8]);
    g.beginPath(); g.moveTo(PAD, y); g.lineTo(width - PAD, y); g.stroke(); g.setLineDash([]);
    y += 26;
    layout.notes.forEach((n, i) => {
      const ls = noteLines[i]!;
      pin(g, PAD + 18, y + 18, n.pin, PIN[n.kind]);
      g.font = `500 30px Space, Arial, sans-serif`; g.fillStyle = '#e6eef7';
      ls.forEach((l, j) => g.fillText(l, PAD + 52, y + 29 + j * 40));
      y += Math.max(1, ls.length) * 40 + 8;
    });
  }
  if (footLines.length) {
    y += 18;
    g.font = `500 28px Space, Arial, sans-serif`; g.fillStyle = mood === 'angry' ? '#ffcdbd' : '#b9d3e3';
    for (const l of footLines) { g.fillText(l, PAD, y + 26); y += 38; }
  }
  return cv;
}

function spaced(g: CanvasRenderingContext2D, s: string, x: number, y: number, tracking: number) {
  for (const ch of s) { g.fillText(ch, x, y); x += g.measureText(ch).width + tracking; }
}

function pin(g: CanvasRenderingContext2D, x: number, y: number, n: number, color: string) {
  g.fillStyle = color; g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.fill();
  g.lineWidth = 3; g.strokeStyle = '#0b1d29'; g.stroke();
  g.fillStyle = '#0b1d29'; g.font = `700 21px Space, Arial, sans-serif`; g.textAlign = 'center';
  g.fillText(String(n), x, y + 7); g.textAlign = 'left';
}

function drawLine(g: CanvasRenderingContext2D, line: Line, x0: number, y: number, h: number, cw: number, gutter: number, inner: number, p: (typeof PALETTE)[Mood]) {
  if (line.type === 'rule') {
    g.strokeStyle = 'rgba(214,226,240,.25)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, y + h / 2); g.lineTo(x0 + inner, y + h / 2); g.stroke();
    return;
  }
  if (line.type === 'caption') {
    g.font = `500 31px Space, Arial, sans-serif`; g.fillStyle = '#f4f4e8';
    g.fillText(line.text, x0, y + 32);
    return;
  }
  const base = y + h * 0.7;
  const tx = x0 + gutter;
  if (line.view === 'output') { g.fillStyle = p.output; g.fillRect(x0 - 14, y, inner + 28, h); }
  if (line.view === 'diff' && (line.diff === 'a' || line.diff === 'd')) {
    g.fillStyle = line.diff === 'a' ? 'rgba(126,220,140,.15)' : 'rgba(222,106,71,.17)';
    g.fillRect(x0 - 14, y + 2, inner + 28, h - 4);
    if (!line.cont) {
      g.font = `700 ${FONT}px ${MONO}`; g.fillStyle = line.diff === 'a' ? '#8ef08a' : '#ff7b6b';
      g.fillText(line.diff === 'a' ? '+' : '−', x0, base);
    }
  }
  if (line.cont) { g.fillStyle = 'rgba(125,166,198,.5)'; g.font = `600 ${FONT * 0.8}px ${MONO}`; g.fillText('↳', x0 + (line.view === 'diff' ? cw : 0), base); }
  if (line.diff === 'l') {
    g.font = `600 ${FONT * 0.85}px ${MONO}`; g.fillStyle = line.view === 'output' ? '#ffd96a' : p.label;
    g.fillText((line.view === 'output' ? '▸ ' : '') + line.text, x0, base);
    drawMarks(g, line.marks, x0 + (line.view === 'output' ? cw * 0.85 * 2 : 0), y, h, cw * 0.85, line);
    return;
  }
  g.font = `600 ${FONT}px ${MONO}`;
  let x = tx;
  g.globalAlpha = line.diff === 'd' ? 0.78 : 1;
  for (const t of line.tokens) { g.fillStyle = t.color; g.fillText(t.text, x, base); x += t.text.length * cw; }
  g.globalAlpha = 1;
  const textW = Math.max(cw * 2, line.text.trimEnd().length * cw);
  const lead = (line.text.match(/^\s*/)?.[0].length ?? 0) * cw;
  if (line.diff === 'd' && line.view === 'diff') {
    // Removed: red strike-through.
    g.strokeStyle = '#ff6b5a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(tx + lead - 4, y + h * 0.5); g.lineTo(tx + textW + 4, y + h * 0.5); g.stroke();
  }
  if (line.diff === 'a' && line.view === 'diff') {
    // Added: green box.
    g.strokeStyle = 'rgba(142,240,138,.75)'; g.lineWidth = 2.5;
    roundRect(g, tx + lead - 7, y + 5, Math.max(cw * 3, textW - lead + 14), h - 10, 7); g.stroke();
  }
  drawMarks(g, line.marks, tx, y, h, cw, line);
}

function drawMarks(g: CanvasRenderingContext2D, marks: Mark[], tx: number, y: number, h: number, cw: number, line: Line) {
  for (const m of marks) {
    const empty = line.text.trim() === '';
    const x1 = tx + (empty ? 0 : m.from * cw), x2 = tx + (empty ? cw * 10 : m.to * cw);
    const col = MARK[m.kind];
    if (m.kind === 'problem') {
      if (line.view === 'diff') {
        g.strokeStyle = col; g.lineWidth = 6;
        g.beginPath(); g.moveTo(x1 - 3, y + h * 0.5); g.lineTo(x2 + 3, y + h * 0.5); g.stroke();
      } else {
        // Editor-style red squiggle.
        g.strokeStyle = col; g.lineWidth = 4; g.beginPath();
        const yy = y + h - 7;
        for (let x = x1; x <= x2; x += 2) g.lineTo(x, yy + Math.sin((x - x1) / 5) * 4.5);
        g.stroke();
      }
    } else if (m.kind === 'note') {
      g.strokeStyle = col; g.lineWidth = 5; g.setLineDash([10, 6]);
      g.beginPath(); g.moveTo(x1, y + h - 6); g.lineTo(x2, y + h - 6); g.stroke(); g.setLineDash([]);
    } else {
      g.strokeStyle = col; g.lineWidth = 4.5;
      if (m.kind === 'fix') { g.fillStyle = 'rgba(142,240,138,.13)'; roundRect(g, x1 - 6, y + 3, x2 - x1 + 12, h - 6, 7); g.fill(); }
      roundRect(g, x1 - 6, y + 3, x2 - x1 + 12, h - 6, 7); g.stroke();
    }
    if (m.pin) pin(g, x2 + 24, y + 14, m.pin, PIN[m.kind]);
  }
}

/** Draw a spray of glass cracks from a point (canvas px). */
export function paintCracks(cv: HTMLCanvasElement, seed: number, cx?: number, cy?: number) {
  const g = cv.getContext('2d')!, r = rng(seed);
  const x0 = cx ?? cv.width * (0.3 + r() * 0.4), y0 = cy ?? cv.height * (0.3 + r() * 0.4);
  const arms = 9 + Math.floor(r() * 5);
  for (const [w, c] of [[7, 'rgba(10,20,30,.55)'], [3, 'rgba(240,250,255,.95)']] as const) {
    const rr = rng(seed);
    g.strokeStyle = c; g.lineWidth = w; g.lineJoin = 'round';
    for (let i = 0; i < arms; i++) {
      let a = (i / arms) * Math.PI * 2 + rr() * 0.5, x = x0, y = y0;
      const len = Math.max(cv.width, cv.height) * (0.25 + rr() * 0.4);
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 7; s++) { a += (rr() - 0.5) * 0.7; x += Math.cos(a) * len / 7; y += Math.sin(a) * len / 7; g.lineTo(x, y); }
      g.stroke();
    }
    // A ring of short cross-cracks.
    for (let i = 0; i < arms; i++) {
      const a = rr() * Math.PI * 2, d = 50 + rr() * 90;
      g.beginPath(); g.moveTo(x0 + Math.cos(a) * d, y0 + Math.sin(a) * d); g.lineTo(x0 + Math.cos(a + 0.5) * d * 1.1, y0 + Math.sin(a + 0.5) * d * 1.1); g.stroke();
    }
  }
  g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(x0, y0, 14, 0, Math.PI * 2); g.fill();
}

/** Rounded rectangle outline used for the slab. */
function slabShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

/** Extrude a shape and map its caps onto the window's texture by absolute position. */
function extrudeMapped(shape: THREE.Shape, depth: number, w: number, h: number, bevel: number) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 5, steps: 1 });
  geo.translate(0, 0, -depth / 2);
  const pos = geo.getAttribute('position'), uv = geo.getAttribute('uv');
  const caps = geo.groups[0]!;
  for (let i = caps.start; i < caps.start + caps.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  uv.needsUpdate = true;
  return geo;
}

/** A chunky 3D editor window: thick slab, painted face, optional angry eyes. */
export class CodeWindow {
  readonly group = new THREE.Group();
  readonly face: THREE.MeshBasicMaterial;
  readonly side: THREE.MeshToonMaterial;
  readonly texture: THREE.CanvasTexture;
  readonly w: number;
  readonly h: number;
  readonly depth: number;
  eyes?: THREE.Group;
  private cracks = 0;
  private t = Math.random() * 10;
  rattle = 0;

  constructor(readonly canvas: HTMLCanvasElement, worldWidth: number, readonly mood: Mood, opts: { maxHeight?: number; depth?: number } = {}) {
    let w = worldWidth, h = (worldWidth * canvas.height) / canvas.width;
    if (opts.maxHeight && h > opts.maxHeight) { w *= opts.maxHeight / h; h = opts.maxHeight; }
    this.w = w; this.h = h; this.depth = opts.depth ?? Math.max(0.16, w * 0.04);
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.face = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    this.side = new THREE.MeshToonMaterial({ color: PALETTE[mood].side, gradientMap: toon('#fff').gradientMap });
    const geo = extrudeMapped(slabShape(w, h, Math.min(w, h) * 0.035), this.depth, w, h, 0.02);
    const slab = new THREE.Mesh(geo, [this.face, this.side]);
    slab.name = 'code-slab'; slab.castShadow = true; slab.receiveShadow = false;
    this.group.add(slab);
    this.group.name = `code-window-${mood}`;
    if (mood === 'angry' || mood === 'boss') this.addEyes();
  }

  private addEyes() {
    const a = kit(0.012), eyes = new THREE.Group();
    const s = Math.min(1.4, this.w * 0.09);
    const headerH = (HEADER / this.canvas.height) * this.h;
    eyes.position.set(this.w / 2 - s * 1.5, this.h / 2 - headerH * 0.55, this.depth / 2 + 0.02);
    for (const side of [-1, 1]) {
      a.ball(eyes, '#fffdf0', side * s * 0.42, 0, 0, s * 0.3, s * 0.24, s * 0.12);
      const pupil = a.ball(eyes, INK, side * s * 0.38, -s * 0.03, s * 0.1, s * 0.12, s * 0.12, s * 0.05, false);
      pupil.name = 'pupil';
      const brow = a.box(eyes, INK, side * s * 0.42, s * 0.24, s * 0.12, s * 0.48, s * 0.1, s * 0.08);
      brow.rotation.z = side * -0.45;
    }
    this.eyes = eyes;
    this.group.add(eyes);
  }

  /** Repaint the face (e.g. the crack overlay). */
  refresh() { this.texture.needsUpdate = true; }

  crack(seed = 1, u?: number, v?: number) {
    this.cracks++;
    paintCracks(this.canvas, seed + this.cracks * 31, u === undefined ? undefined : u * this.canvas.width, v === undefined ? undefined : (1 - v!) * this.canvas.height);
    this.refresh();
  }

  update(dt: number) {
    this.t += dt;
    if (this.eyes) {
      const blink = Math.sin(this.t * 0.9) > 0.985 ? 0.15 : 1;
      this.eyes.scale.y = blink;
    }
    if (this.rattle > 0) {
      this.group.children[0]!.position.set((Math.random() - 0.5) * 0.04 * this.rattle, (Math.random() - 0.5) * 0.04 * this.rattle, 0);
    }
  }

  /**
   * Break into jagged physical pieces that keep their bit of the code on their face.
   * The window's own group is removed; the pieces belong to the debris world.
   */
  shatter(debris: Debris, from: THREE.Vector3, power = 6, grid = [6, 4] as [number, number], seed = 7) {
    this.group.updateMatrixWorld(true);
    const [cols, rows] = grid;
    const r = rng(seed);
    const w = this.w, h = this.h, d = this.depth;
    const P: [number, number][][] = [];
    for (let i = 0; i <= cols; i++) {
      P[i] = [];
      for (let j = 0; j <= rows; j++) {
        const jx = i > 0 && i < cols ? (r() - 0.5) * 0.55 * (w / cols) : 0;
        const jy = j > 0 && j < rows ? (r() - 0.5) * 0.55 * (h / rows) : 0;
        P[i]![j] = [-w / 2 + (i * w) / cols + jx, -h / 2 + (j * h) / rows + jy];
      }
    }
    const jag = new Map<string, [number, number][]>();
    const edge = (a: [number, number], b: [number, number], key: string, inner: boolean) => {
      let pts = jag.get(key);
      if (!pts) {
        pts = [a];
        if (inner) for (let k = 1; k <= 2; k++) {
          const t = k / 3, nx = -(b[1] - a[1]), ny = b[0] - a[0], len = Math.hypot(nx, ny) || 1;
          const off = (r() - 0.5) * 0.18 * len;
          pts.push([a[0] + (b[0] - a[0]) * t + (nx / len) * off, a[1] + (b[1] - a[1]) * t + (ny / len) * off]);
        }
        pts.push(b);
        jag.set(key, pts);
      }
      return pts;
    };
    const H = (i: number, j: number) => edge(P[i]![j]!, P[i + 1]![j]!, `h${i},${j}`, j > 0 && j < rows);
    const Vt = (i: number, j: number) => edge(P[i]![j]!, P[i]![j + 1]!, `v${i},${j}`, i > 0 && i < cols);
    const refs = { n: 0 };
    this.face.userData.refs = 0; this.side.userData.refs = 0;
    const centre = new THREE.Vector3();
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const poly = [...H(i, j).slice(0, -1), ...Vt(i + 1, j).slice(0, -1), ...[...H(i, j + 1)].reverse().slice(0, -1), ...[...Vt(i, j)].reverse().slice(0, -1)];
      const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
      const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
      const geo = extrudeMapped(shape, d, w, h, 0);
      geo.translate(-cx, -cy, 0);
      const mesh = new THREE.Mesh(geo, [this.face, this.side]);
      mesh.castShadow = true;
      mesh.position.set(cx, cy, 0);
      this.group.add(mesh);
      const hull = new Float32Array(poly.length * 6);
      poly.forEach(([x, y], k) => { hull.set([x - cx, y - cy, d / 2], k * 6); hull.set([x - cx, y - cy, -d / 2], k * 6 + 3); });
      const world = mesh.getWorldPosition(centre);
      const away = world.clone().sub(from).normalize().multiplyScalar(power * (0.5 + r() * 0.8));
      away.y += 2 + r() * 4;
      const spin = new THREE.Vector3((r() - 0.5) * 9, (r() - 0.5) * 9, (r() - 0.5) * 9);
      this.face.userData.refs++; this.side.userData.refs++; refs.n++;
      debris.add(mesh, hull, new THREE.Vector3(), away, spin, 4.5 + r() * 2.5);
    }
    // The slab itself and the eyes go; eyes tumble as their own pieces.
    const slab = this.group.getObjectByName('code-slab') as THREE.Mesh;
    slab.geometry.dispose(); slab.removeFromParent();
    if (this.eyes) debris.breakObject(this.eyes, { from, power: power * 0.8 });
    this.group.removeFromParent();
  }

  dispose() {
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry && !m.geometry.userData.shared) m.geometry.dispose(); });
    if (!this.face.userData.refs) { this.texture.dispose(); this.face.dispose(); this.side.dispose(); }
    this.group.removeFromParent();
  }
}
