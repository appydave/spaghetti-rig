import { describe, expect, it } from "vitest";
import { CITY_LAYOUT, ROAD_HALF } from "#root/src/world/city.ts";
import { layoutCity } from "#root/src/world/city-layout.ts";
import type { Placement } from "#root/src/world/city-layout-types.ts";

/** Counts and first values of the street at seed 1000, 200 long, read off the original buildCity (the same counts of instances) before the layout was moved out. */
const PINNED = {
  leftBodies: 34,
  rightBodies: 35,
  leftTrees: 28,
  rightTrees: 30,
  leftWindows: 668,
  rightWindows: 646,
  leftLamps: 28,
  rightLamps: 20,
  firstLeftX: -10.797190112341195,
  firstLeftHeight: 5.026488703385306,
  firstFarZ: -43.01788879558444,
};

const LENGTH = 200;
const SEED = 1000;
const PLAZA = { from: -60, to: -100 };

const street = (seed = SEED, plaza?: { from: number; to: number }) =>
  layoutCity(LENGTH, seed, plaza, CITY_LAYOUT);
const inPlaza = (p: Placement) =>
  p.z + p.sz / 2 > PLAZA.to && p.z - p.sz / 2 < PLAZA.from;
const sides = (l: ReturnType<typeof street>) => [l.left, l.right];

describe("layoutCity is a pure function of its seed", () => {
  it("gives the same street for the same seed, and another for another seed", () => {
    expect(street(SEED)).toEqual(street(SEED));
    expect(street(SEED + 1)).not.toEqual(street(SEED));
  });

  it("draws its decisions in a fixed order from the seed: the counts and first buildings of seed 1000 are pinned", () => {
    const l = street();

    expect([
      l.left.bodies.length,
      l.right.bodies.length,
      l.left.trunks.length,
      l.right.trunks.length,
      l.left.windows.length,
      l.right.windows.length,
      l.left.lamps.length,
      l.right.lamps.length,
      l.far.length,
    ]).toEqual([
      PINNED.leftBodies,
      PINNED.rightBodies,
      PINNED.leftTrees,
      PINNED.rightTrees,
      PINNED.leftWindows,
      PINNED.rightWindows,
      PINNED.leftLamps,
      PINNED.rightLamps,
      CITY_LAYOUT.far.count,
    ]);
    expect(l.left.bodies[0]?.x).toBeCloseTo(PINNED.firstLeftX, 6);
    expect(l.left.bodies[0]?.sy).toBeCloseTo(PINNED.firstLeftHeight, 6);
    expect(l.far[0]?.z).toBeCloseTo(PINNED.firstFarZ, 6);
  });

  it("changes the street when a number in the table changes", () => {
    const noGaps = layoutCity(LENGTH, SEED, undefined, {
      ...CITY_LAYOUT,
      buildings: { ...CITY_LAYOUT.buildings, gapChance: 0 },
    });

    expect(noGaps.left.bodies.length).toBeGreaterThan(
      street().left.bodies.length,
    );
  });
});

describe("the street the layout lays out", () => {
  it("puts the left side's buildings left of the road and the right side's right of it, with trees on the kerb", () => {
    const l = street();

    expect(l.left.bodies.every((b) => b.x < -ROAD_HALF)).toBe(true);
    expect(l.right.bodies.every((b) => b.x > ROAD_HALF)).toBe(true);
    expect(
      l.left.trunks.every((t) => t.x === -(ROAD_HALF + CITY_LAYOUT.trees.kerb)),
    ).toBe(true);
    expect(
      l.right.trunks.every((t) => t.x === ROAD_HALF + CITY_LAYOUT.trees.kerb),
    ).toBe(true);
  });

  it("keeps each side's buildings apart along the street, never overlapping", () => {
    for (const side of sides(street())) {
      const bodies = [...side.bodies].sort((a, b) => b.z - a.z);

      for (const [i, b] of bodies.entries()) {
        const next = bodies[i + 1];

        if (next) {
          expect(b.z - b.sz / 2).toBeGreaterThan(next.z + next.sz / 2);
        }
      }
    }
  });

  it("gives every building at least one window, on the face toward the road", () => {
    for (const side of sides(street())) {
      expect(side.windows.length).toBeGreaterThanOrEqual(side.bodies.length);
      for (const w of side.windows) {
        expect(Math.abs(w.x)).toBeLessThan(
          Math.max(...side.bodies.map((b) => Math.abs(b.x))),
        );
        expect(Math.abs(w.x)).toBeGreaterThan(ROAD_HALF);
      }
    }
  });

  it("alternates the far skyline between the two sides, beyond the street", () => {
    const far = street().far;

    expect(far).toHaveLength(CITY_LAYOUT.far.count);
    for (const [i, b] of far.entries()) {
      expect(Math.sign(b.x)).toBe(i % 2 ? 1 : -1);
      expect(Math.abs(b.x)).toBeGreaterThanOrEqual(CITY_LAYOUT.far.minX);
      expect(b.y).toBe(0);
    }
  });
});

describe("the plaza", () => {
  it("keeps buildings, roofs, windows, trees and lamps out of the boss arena", () => {
    const l = street(SEED, PLAZA);

    for (const side of sides(l)) {
      const placed = [...side.bodies, ...side.windows];

      expect(placed.filter(inPlaza)).toEqual([]);
      expect(
        side.trunks.filter((t) => t.z < PLAZA.from && t.z > PLAZA.to),
      ).toEqual([]);
      expect(
        side.lamps.filter((t) => t.z < PLAZA.from && t.z > PLAZA.to),
      ).toEqual([]);
    }
  });

  it("still builds there when there is no plaza", () => {
    const l = street(SEED);
    const there = [...l.left.bodies, ...l.right.bodies].filter(inPlaza);

    expect(there.length).toBeGreaterThan(0);
  });
});
