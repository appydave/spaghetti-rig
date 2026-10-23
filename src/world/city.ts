import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, toon } from './toon';

export const ROAD_HALF = 3.6;
export const SEGMENT = 34; // distance between stops

const BUILDING = ['#eef1dc', '#dceadb', '#d2e6d6', '#e7edd5', '#cde2d2', '#f1efdf', '#d9e9e1'];
const WINDOW = ['#5f8f86', '#6f9d92', '#4f7f78', '#86b0a3'];

function pavingTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#e8efe1'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#d3dfcf'; g.lineWidth = 4;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 128); g.lineTo(512, i * 128); g.stroke(); }
  for (let r = 0; r < 4; r++) for (let i = 0; i <= 2; i++) {
    const x = i * 256 + (r % 2) * 128;
    g.beginPath(); g.moveTo(x, r * 128); g.lineTo(x, r * 128 + 128); g.stroke();
  }
  // Soft speckle so the paving doesn't look like plastic.
  const rand = rng(7);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(120,150,120,${rand() * 0.05})`; g.fillRect(rand() * 512, rand() * 512, 3, 3); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** Instanced rounded boxes with per-instance colour. */
class Batch {
  readonly matrices: THREE.Matrix4[] = [];
  readonly colors: THREE.Color[] = [];
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, ry = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
    this.matrices.push(m); this.colors.push(new THREE.Color(color));
  }
  build(geometry: THREE.BufferGeometry, cast = true, receive = true, material: THREE.Material = toon('#ffffff')) {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, this.matrices.length));
    this.matrices.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, this.colors[i]!); });
    mesh.count = this.matrices.length;
    mesh.castShadow = cast; mesh.receiveShadow = receive;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

/** A street from z=+30 down to z=-length. Both players get the same one (same seed). */
/** `plaza`: a stretch of road (z from → to, from > to) with no buildings or trees, for the boss arena. */
export function buildCity(length: number, seed: number, plaza?: { from: number; to: number }): THREE.Group {
  const open = (z: number, half = 0) => !!plaza && z + half > plaza.to && z - half < plaza.from;
  const city = new THREE.Group(); city.name = 'mint-city';
  const rand = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]!;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, length + 400), toon('#cfe2cf'));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, -length / 2); ground.receiveShadow = true;
  city.add(ground);
  const paving = pavingTexture();
  paving.repeat.set(ROAD_HALF * 2 / 4, (length + 60) / 4);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, length + 60), new THREE.MeshToonMaterial({ map: paving, color: '#ffffff', gradientMap: toon('#fff').gradientMap }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -length / 2 + 15); road.receiveShadow = true;
  city.add(road);

  const curbs = new Batch();
  for (const side of [-1, 1]) {
    // Each side of the street is its own group, so a side-on camera can hide the near side.
    const bodies = new Batch(), roofs = new Batch(), windows = new Batch(), trunks = new Batch(), crowns = new Batch(), planters = new Batch(), lamps = new Batch(), bulbs = new Batch();
    // Sidewalk slab and curb.
    curbs.add(side * (ROAD_HALF + 1.4), 0.08, -length / 2 + 15, 2.8, 0.16, length + 60, '#dfe9d8');
    curbs.add(side * (ROAD_HALF + 0.05), 0.12, -length / 2 + 15, 0.18, 0.24, length + 60, '#c3d6c4');
    // Buildings along the street, with occasional gaps for side streets.
    for (let z = 30; z > -length - 30;) {
      const w = 4 + rand() * 4, d = 5 + rand() * 4, h = 4.5 + rand() * rand() * 12;
      if (rand() < 0.13) { z -= 3.5 + rand() * 3; continue; }
      const cx = side * (ROAD_HALF + 3 + d / 2 + rand() * 1.2), cz = z - w / 2;
      if (open(cz, w / 2)) { z -= w + 0.4; continue; }
      const col = pick(BUILDING);
      bodies.add(cx, h / 2, cz, d, h, w, col);
      roofs.add(cx, h + 0.12, cz, d + 0.35, 0.28, w + 0.35, '#f4f4e8');
      if (rand() < 0.5) roofs.add(cx + side * (rand() - 0.5) * d * 0.4, h + 0.55, cz + (rand() - 0.5) * w * 0.4, 0.9, 0.7, 0.9, '#c9dccb');
      if (rand() < 0.3) roofs.add(cx, h + 1.2, cz, 0.12, 2, 0.12, '#9fbfae');
      // Window grid on the face toward the road.
      const face = cx - side * (d / 2 + 0.02);
      const cols = Math.max(1, Math.floor((w - 0.8) / 1.05)), rows = Math.max(1, Math.floor((h - 1.2) / 1.25));
      const wc = pick(WINDOW);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const wz = cz - (w - 0.8) / 2 + (c + 0.5) * ((w - 0.8) / cols);
        const wy = 1.1 + r * 1.25 + 0.3;
        windows.add(face, wy, wz, 0.12, 0.72, 0.6, rand() < 0.12 ? '#2f5f57' : wc);
      }
      z -= w + 0.4 + rand() * 1.2;
    }
    // Lollipop trees in planters, and lamp posts.
    for (let z = 24 - rand() * 4; z > -length - 20; z -= 7 + rand() * 3) {
      const x = side * (ROAD_HALF + 1.5);
      if (open(z, 4)) continue;
      planters.add(x, 0.35, z, 1.1, 0.5, 1.1, '#7fae8f');
      trunks.add(x, 1.1, z, 0.12, 1.4, 0.12, '#7a9f83');
      const s = 0.75 + rand() * 0.25;
      crowns.add(x, 2.2, z, s, s * 0.95, s, '#a9d3b1');
      crowns.add(x + 0.35, 2.0, z + 0.25, s * 0.6, s * 0.6, s * 0.6, '#bfe0c1');
      crowns.add(x - 0.3, 2.45, z - 0.2, s * 0.55, s * 0.55, s * 0.55, '#98c7a3');
      if (rand() < 0.45) {
        const lz = z - 3.5;
        lamps.add(x, 1.7, lz, 0.08, 3.4, 0.08, '#4f7f78');
        lamps.add(x - side * 0.35, 3.4, lz, 0.8, 0.08, 0.08, '#4f7f78');
        bulbs.add(x - side * 0.7, 3.3, lz, 0.22, 0.14, 0.22, '#fff1b8');
      }
    }
    const half = new THREE.Group(); half.name = side > 0 ? 'city-right' : 'city-left';
    half.add(bodies.build(new RoundedBoxGeometry(1, 1, 1, 3, 0.08)));
    half.add(roofs.build(new RoundedBoxGeometry(1, 1, 1, 2, 0.1)));
    half.add(windows.build(new RoundedBoxGeometry(1, 1, 1, 2, 0.04), false));
    half.add(planters.build(new RoundedBoxGeometry(1, 1, 1, 2, 0.12)));
    half.add(trunks.build(new THREE.CylinderGeometry(1, 1, 1, 8)));
    half.add(crowns.build(new THREE.SphereGeometry(1, 16, 12)));
    half.add(lamps.build(new THREE.BoxGeometry(1, 1, 1)));
    half.add(bulbs.build(new THREE.SphereGeometry(1, 10, 8), false, false, new THREE.MeshBasicMaterial({ color: '#ffffff' })));
    city.add(half);
  }
  // Road markings: dashed centre line.
  for (let z = 28; z > -length - 20; z -= 4) curbs.add(0, 0.01, z, 0.14, 0.02, 1.8, '#f4f4e8');
  city.add(curbs.build(new THREE.BoxGeometry(1, 1, 1), false));

  // Distant skyline silhouettes beyond the street, softened by fog.
  const far = new Batch();
  for (let i = 0; i < 40; i++) {
    const side = i % 2 ? 1 : -1;
    far.add(side * (30 + rand() * 30), 0, 30 - rand() * (length + 80), 6 + rand() * 8, 10 + rand() * 26, 6 + rand() * 8, '#c3dacb');
  }
  const farMesh = far.build(new RoundedBoxGeometry(1, 1, 1, 2, 0.1), false, false);
  city.add(farMesh);
  return city;
}
