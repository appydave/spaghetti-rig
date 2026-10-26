// Hand-placed model geometry and materials: asset data, exempt from the magic-number and colour gates (R7 revised, David 2026-10-23).
import * as THREE from "three";
import { context2d } from "../dom";
import { nth } from "../nth";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { layoutCity } from "./city-layout";
import type { CityLayoutTable, Placement } from "./city-layout-types";
import { rng, toon } from "./toon";

export const ROAD_HALF = 3.6;
export const SEGMENT = 34; // distance between stops

const BUILDING = [
  "#eef1dc",
  "#dceadb",
  "#d2e6d6",
  "#e7edd5",
  "#cde2d2",
  "#f1efdf",
  "#d9e9e1",
];
const WINDOW = ["#5f8f86", "#6f9d92", "#4f7f78", "#86b0a3"];

/** The numbers and colours of the street's layout: data only, read by layoutCity in city-layout.ts. */
export const CITY_LAYOUT = {
  roadHalf: ROAD_HALF,
  buildings: {
    startZ: 30,
    endMargin: 30,
    width: { min: 4, spread: 4 },
    depth: { min: 5, spread: 4 },
    height: { min: 4.5, spread: 12 },
    gapChance: 0.13,
    gap: { min: 3.5, spread: 3 },
    setback: 3,
    setbackJitter: 1.2,
    step: 0.4,
    stepJitter: 1.2,
    colors: BUILDING,
  },
  roof: {
    lift: 0.12,
    slab: 0.28,
    overhang: 0.35,
    boxChance: 0.5,
    boxLift: 0.55,
    boxSpread: 0.4,
    boxSize: [0.9, 0.7, 0.9],
    boxColor: "#c9dccb",
    aerialChance: 0.3,
    aerialLift: 1.2,
    aerialSize: [0.12, 2, 0.12],
    aerialColor: "#9fbfae",
    slabColor: "#f4f4e8",
  },
  windows: {
    faceOffset: 0.02,
    margin: 0.8,
    columnWidth: 1.05,
    rowHeight: 1.25,
    rowMargin: 1.2,
    firstRow: 1.1,
    sill: 0.3,
    size: [0.12, 0.72, 0.6],
    darkChance: 0.12,
    darkColor: "#2f5f57",
    colors: WINDOW,
  },
  trees: {
    startZ: 24,
    startJitter: 4,
    endMargin: 20,
    step: 7,
    stepJitter: 3,
    clearance: 4,
    kerb: 1.5,
    planter: { y: 0.35, size: [1.1, 0.5, 1.1], color: "#7fae8f" },
    trunk: { y: 1.1, size: [0.12, 1.4, 0.12], color: "#7a9f83" },
    crown: { y: 2.2, base: 0.75, spread: 0.25, color: "#a9d3b1" },
    crownB: { x: 0.35, y: 2.0, z: 0.25, share: 0.6, color: "#bfe0c1" },
    crownC: { x: -0.3, y: 2.45, z: -0.2, share: 0.55, color: "#98c7a3" },
    crownTall: 0.95,
    lampChance: 0.45,
    lampBack: 3.5,
    lamp: { y: 1.7, size: [0.08, 3.4, 0.08], color: "#4f7f78" },
    arm: { x: 0.35, y: 3.4, size: [0.8, 0.08, 0.08] },
    bulb: { x: 0.7, y: 3.3, size: [0.22, 0.14, 0.22], color: "#fff1b8" },
  },
  far: {
    count: 40,
    alternate: 2,
    minX: 30,
    spreadX: 30,
    startZ: 30,
    extra: 80,
    width: { min: 6, spread: 8 },
    height: { min: 10, spread: 26 },
    depth: { min: 6, spread: 8 },
    color: "#c3dacb",
  },
} as const satisfies CityLayoutTable;

function pavingTexture() {
  const cv = document.createElement("canvas");

  cv.width = cv.height = 512;

  const g = context2d(cv);

  g.fillStyle = "#e8efe1";
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "#d3dfcf";
  g.lineWidth = 4;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(0, i * 128);
    g.lineTo(512, i * 128);
    g.stroke();
  }

  for (let r = 0; r < 4; r++) {
    for (let i = 0; i <= 2; i++) {
      const x = i * 256 + (r % 2) * 128;

      g.beginPath();
      g.moveTo(x, r * 128);
      g.lineTo(x, r * 128 + 128);
      g.stroke();
    }
  }

  // Soft speckle so the paving doesn't look like plastic.
  const rand = rng(7);

  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(120,150,120,${rand() * 0.05})`;
    g.fillRect(rand() * 512, rand() * 512, 3, 3);
  }

  const t = new THREE.CanvasTexture(cv);

  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;

  return t;
}

/** Instanced rounded boxes with per-instance colour. */
class Batch {
  readonly matrices: THREE.Matrix4[] = [];
  readonly colors: THREE.Color[] = [];

  add(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: string,
    ry = 0,
  ) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
      new THREE.Vector3(sx, sy, sz),
    );

    this.matrices.push(m);
    this.colors.push(new THREE.Color(color));
  }

  build(
    geometry: THREE.BufferGeometry,
    cast = true,
    receive = true,
    material: THREE.Material = toon("#ffffff"),
  ) {
    const mesh = new THREE.InstancedMesh(
      geometry,
      material,
      Math.max(1, this.matrices.length),
    );

    for (const [i, m] of this.matrices.entries()) {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, nth(this.colors, i, "city colors"));
    }

    mesh.count = this.matrices.length;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.computeBoundingSphere();

    return mesh;
  }
}

/** A batch holding these placements, in order. */
function batchOf(placements: Placement[]): Batch {
  const batch = new Batch();

  for (const p of placements) {
    batch.add(p.x, p.y, p.z, p.sx, p.sy, p.sz, p.color);
  }

  return batch;
}

/** A street from z=+30 down to z=-length. Both players get the same one (same seed). */
/** `plaza`: a stretch of road (z from → to, from > to) with no buildings or trees, for the boss arena. */
export function buildCity(
  length: number,
  seed: number,
  plaza?: { from: number; to: number },
): THREE.Group {
  const city = new THREE.Group();

  city.name = "mint-city";

  const layout = layoutCity(length, seed, plaza, CITY_LAYOUT);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, length + 400),
    toon("#cfe2cf"),
  );

  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, -length / 2);
  ground.receiveShadow = true;
  city.add(ground);

  const paving = pavingTexture();

  paving.repeat.set((ROAD_HALF * 2) / 4, (length + 60) / 4);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF * 2, length + 60),
    new THREE.MeshToonMaterial({
      map: paving,
      color: "#ffffff",
      gradientMap: toon("#fff").gradientMap,
    }),
  );

  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -length / 2 + 15);
  road.receiveShadow = true;
  city.add(road);

  const curbs = new Batch();

  for (const side of [-1, 1]) {
    // Each side of the street is its own group, so a side-on camera can hide the near side.
    const mine = side > 0 ? layout.right : layout.left;
    const bodies = batchOf(mine.bodies);
    const roofs = batchOf(mine.roofs);
    const windows = batchOf(mine.windows);
    const trunks = batchOf(mine.trunks);
    const crowns = batchOf(mine.crowns);
    const planters = batchOf(mine.planters);
    const lamps = batchOf(mine.lamps);
    const bulbs = batchOf(mine.bulbs);

    // Sidewalk slab and curb.
    curbs.add(
      side * (ROAD_HALF + 1.4),
      0.08,
      -length / 2 + 15,
      2.8,
      0.16,
      length + 60,
      "#dfe9d8",
    );
    curbs.add(
      side * (ROAD_HALF + 0.05),
      0.12,
      -length / 2 + 15,
      0.18,
      0.24,
      length + 60,
      "#c3d6c4",
    );

    const half = new THREE.Group();

    half.name = side > 0 ? "city-right" : "city-left";
    half.add(bodies.build(new RoundedBoxGeometry(1, 1, 1, 3, 0.08)));
    half.add(roofs.build(new RoundedBoxGeometry(1, 1, 1, 2, 0.1)));
    half.add(windows.build(new RoundedBoxGeometry(1, 1, 1, 2, 0.04), false));
    half.add(planters.build(new RoundedBoxGeometry(1, 1, 1, 2, 0.12)));
    half.add(trunks.build(new THREE.CylinderGeometry(1, 1, 1, 8)));
    half.add(crowns.build(new THREE.SphereGeometry(1, 16, 12)));
    half.add(lamps.build(new THREE.BoxGeometry(1, 1, 1)));
    half.add(
      bulbs.build(
        new THREE.SphereGeometry(1, 10, 8),
        false,
        false,
        new THREE.MeshBasicMaterial({ color: "#ffffff" }),
      ),
    );
    city.add(half);
  }

  // Road markings: dashed centre line.
  for (let z = 28; z > -length - 20; z -= 4) {
    curbs.add(0, 0.01, z, 0.14, 0.02, 1.8, "#f4f4e8");
  }

  city.add(curbs.build(new THREE.BoxGeometry(1, 1, 1), false));

  // Distant skyline silhouettes beyond the street, softened by fog.
  const far = batchOf(layout.far);

  const farMesh = far.build(
    new RoundedBoxGeometry(1, 1, 1, 2, 0.1),
    false,
    false,
  );

  city.add(farMesh);

  return city;
}
