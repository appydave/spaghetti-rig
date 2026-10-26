// Where a street's buildings, trees, lamps and far skyline go (After-G04 A2b): the seeded placement decisions, as a pure function that returns
// placements. Moved out of city.ts's buildCity as it was: the same random stream, drawn in the same order, so a seed gives the same street.
// buildCity turns the placements into meshes. The numbers and colours are CITY_LAYOUT in city.ts (the model file); this file holds none.
// Its types are in city-layout-types.ts.
import { nth } from "../nth";
import type {
  CityLayout,
  CityLayoutTable,
  Placement,
  Plaza,
  SideLayout,
  Span,
} from "./city-layout-types";
import { rng } from "./toon";

type Side = -1 | 1;

const emptySide = (): SideLayout => ({
  bodies: [],
  roofs: [],
  windows: [],
  trunks: [],
  crowns: [],
  planters: [],
  lamps: [],
  bulbs: [],
});

const at = (
  position: readonly [number, number, number],
  size: readonly [number, number, number],
  color: string,
): Placement => ({
  x: position[0],
  y: position[1],
  z: position[2],
  sx: size[0],
  sy: size[1],
  sz: size[2],
  color,
});

/** One building's footprint along the street: its centre, width along the street, depth across it, and height. */
interface Building {
  cx: number;
  cz: number;
  w: number;
  d: number;
  h: number;
}

/** Draws every decision from one seeded stream, in the order the street is laid: the left side, the right side, then the far skyline. */
class Planner {
  private readonly rand: () => number;

  constructor(
    seed: number,
    private readonly k: CityLayoutTable,
    private readonly plaza: Plaza | undefined,
  ) {
    this.rand = rng(seed);
  }

  private within(span: Span): number {
    return span.min + this.rand() * span.spread;
  }

  private pick<T>(list: readonly T[]): T {
    return nth(list, Math.floor(this.rand() * list.length), "pick list");
  }

  private open(z: number, half = 0): boolean {
    return (
      !!this.plaza && z + half > this.plaza.to && z - half < this.plaza.from
    );
  }

  /** Buildings along one side, with occasional gaps for side streets; none inside the plaza. */
  buildings(side: Side, length: number, out: SideLayout) {
    const k = this.k.buildings;

    for (let z = k.startZ; z > -length - k.endMargin;) {
      const w = this.within(k.width);
      const d = this.within(k.depth);
      const h = k.height.min + this.rand() * this.rand() * k.height.spread;

      if (this.rand() < k.gapChance) {
        z -= this.within(k.gap);
        continue;
      }

      const cx =
        side *
        (this.k.roadHalf + k.setback + d / 2 + this.rand() * k.setbackJitter);
      const cz = z - w / 2;

      if (this.open(cz, w / 2)) {
        z -= w + k.step;
        continue;
      }

      this.building(side, { cx, cz, w, d, h }, out);
      z -= w + k.step + this.rand() * k.stepJitter;
    }
  }

  private building(side: Side, b: Building, out: SideLayout) {
    const k = this.k.roof;
    const color = this.pick(this.k.buildings.colors);

    out.bodies.push(at([b.cx, b.h / 2, b.cz], [b.d, b.h, b.w], color));
    out.roofs.push(
      at(
        [b.cx, b.h + k.lift, b.cz],
        [b.d + k.overhang, k.slab, b.w + k.overhang],
        k.slabColor,
      ),
    );
    if (this.rand() < k.boxChance) {
      out.roofs.push(
        at(
          [
            b.cx + side * (this.rand() - 1 / 2) * b.d * k.boxSpread,
            b.h + k.boxLift,
            b.cz + (this.rand() - 1 / 2) * b.w * k.boxSpread,
          ],
          k.boxSize,
          k.boxColor,
        ),
      );
    }

    if (this.rand() < k.aerialChance) {
      out.roofs.push(
        at([b.cx, b.h + k.aerialLift, b.cz], k.aerialSize, k.aerialColor),
      );
    }

    this.windowGrid(side, b, out);
  }

  /** The window grid on the face toward the road. */
  private windowGrid(side: Side, b: Building, out: SideLayout) {
    const k = this.k.windows;
    const face = b.cx - side * (b.d / 2 + k.faceOffset);
    const usable = b.w - k.margin;
    const cols = Math.max(1, Math.floor(usable / k.columnWidth));
    const rows = Math.max(1, Math.floor((b.h - k.rowMargin) / k.rowHeight));
    const wc = this.pick(k.colors);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wz = b.cz - usable / 2 + (c + 1 / 2) * (usable / cols);
        const wy = k.firstRow + r * k.rowHeight + k.sill;

        out.windows.push(
          at(
            [face, wy, wz],
            k.size,
            this.rand() < k.darkChance ? k.darkColor : wc,
          ),
        );
      }
    }
  }

  /** Lollipop trees in planters, and lamp posts, down one side. */
  trees(side: Side, length: number, out: SideLayout) {
    const k = this.k.trees;
    const x = side * (this.k.roadHalf + k.kerb);

    for (
      let z = k.startZ - this.rand() * k.startJitter;
      z > -length - k.endMargin;
      z -= k.step + this.rand() * k.stepJitter
    ) {
      if (this.open(z, k.clearance)) {
        continue;
      }

      this.tree(side, x, z, out);
    }
  }

  private tree(side: Side, x: number, z: number, out: SideLayout) {
    const k = this.k.trees;
    const s = k.crown.base + this.rand() * k.crown.spread;

    out.planters.push(at([x, k.planter.y, z], k.planter.size, k.planter.color));
    out.trunks.push(at([x, k.trunk.y, z], k.trunk.size, k.trunk.color));
    out.crowns.push(
      at([x, k.crown.y, z], [s, s * k.crownTall, s], k.crown.color),
    );
    for (const c of [k.crownB, k.crownC]) {
      const size = s * c.share;

      out.crowns.push(at([x + c.x, c.y, z + c.z], [size, size, size], c.color));
    }

    if (this.rand() < k.lampChance) {
      this.lamp(side, x, z - k.lampBack, out);
    }
  }

  private lamp(side: Side, x: number, lz: number, out: SideLayout) {
    const k = this.k.trees;

    out.lamps.push(
      at([x, k.lamp.y, lz], k.lamp.size, k.lamp.color),
      at([x - side * k.arm.x, k.arm.y, lz], k.arm.size, k.lamp.color),
    );
    out.bulbs.push(
      at([x - side * k.bulb.x, k.bulb.y, lz], k.bulb.size, k.bulb.color),
    );
  }

  /** Distant skyline silhouettes beyond the street, alternating sides. */
  skyline(length: number): Placement[] {
    const k = this.k.far;
    const out: Placement[] = [];

    for (let i = 0; i < k.count; i++) {
      const side = i % k.alternate ? 1 : -1;
      const x = side * (k.minX + this.rand() * k.spreadX);
      const z = k.startZ - this.rand() * (length + k.extra);
      const w = this.within(k.width);
      const h = this.within(k.height);
      const d = this.within(k.depth);

      out.push(at([x, 0, z], [w, h, d], k.color));
    }

    return out;
  }
}

/** The street from z=+30 down to z=-length, laid out from a seed: the same seed gives the same street. */
export function layoutCity(
  length: number,
  seed: number,
  plaza: Plaza | undefined,
  table: CityLayoutTable,
): CityLayout {
  const planner = new Planner(seed, table, plaza);
  const left = emptySide();
  const right = emptySide();

  for (const [side, out] of [
    [-1, left],
    [1, right],
  ] as const) {
    planner.buildings(side, length, out);
    planner.trees(side, length, out);
  }

  return { left, right, far: planner.skyline(length) };
}
