// The types of the street layout (After-G04 A2b): a placement, one side's placements, and the table of numbers and colours that layoutCity
// reads (CITY_LAYOUT in city.ts). Split from city-layout.ts to keep that file under the size limit.

/** One instance to place: a box at (x, y, z) of size (sx, sy, sz) in a colour. */
export interface Placement {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: string;
}

/** Everything placed along one side of the street, by what it is made of. */
export interface SideLayout {
  bodies: Placement[];
  roofs: Placement[];
  windows: Placement[];
  trunks: Placement[];
  crowns: Placement[];
  planters: Placement[];
  lamps: Placement[];
  bulbs: Placement[];
}

export interface CityLayout {
  left: SideLayout;
  right: SideLayout;
  far: Placement[];
}

/** A stretch of road (z from > to) with no buildings or trees, for the boss arena. */
export interface Plaza {
  from: number;
  to: number;
}

/** A size range: min, plus a random share of spread. */
export interface Span {
  min: number;
  spread: number;
}

/** The numbers and colours of the layout: data only, read by layoutCity. */
export interface CityLayoutTable {
  /** One half, for centring and halving. */
  half: number;
  roadHalf: number;
  buildings: {
    startZ: number;
    endMargin: number;
    width: Span;
    depth: Span;
    height: Span;
    gapChance: number;
    gap: Span;
    setback: number;
    setbackJitter: number;
    step: number;
    stepJitter: number;
    colors: readonly string[];
  };
  roof: {
    lift: number;
    slab: number;
    overhang: number;
    boxChance: number;
    boxLift: number;
    boxSpread: number;
    boxSize: readonly [number, number, number];
    boxColor: string;
    aerialChance: number;
    aerialLift: number;
    aerialSize: readonly [number, number, number];
    aerialColor: string;
    slabColor: string;
  };
  windows: {
    faceOffset: number;
    margin: number;
    columnWidth: number;
    rowHeight: number;
    rowMargin: number;
    firstRow: number;
    sill: number;
    size: readonly [number, number, number];
    darkChance: number;
    darkColor: string;
    colors: readonly string[];
  };
  trees: {
    startZ: number;
    startJitter: number;
    endMargin: number;
    step: number;
    stepJitter: number;
    clearance: number;
    kerb: number;
    planter: {
      y: number;
      size: readonly [number, number, number];
      color: string;
    };
    trunk: {
      y: number;
      size: readonly [number, number, number];
      color: string;
    };
    crown: { y: number; base: number; spread: number; color: string };
    crownB: { x: number; y: number; z: number; share: number; color: string };
    crownC: { x: number; y: number; z: number; share: number; color: string };
    crownTall: number;
    lampChance: number;
    lampBack: number;
    lamp: { y: number; size: readonly [number, number, number]; color: string };
    arm: { x: number; y: number; size: readonly [number, number, number] };
    bulb: {
      x: number;
      y: number;
      size: readonly [number, number, number];
      color: string;
    };
  };
  far: {
    count: number;
    alternate: number;
    minX: number;
    spreadX: number;
    startZ: number;
    extra: number;
    width: Span;
    height: Span;
    depth: Span;
    color: string;
  };
}
