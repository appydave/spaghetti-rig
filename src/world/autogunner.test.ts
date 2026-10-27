import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AutoGunner, type Target } from "#root/src/world/autogunner.ts";

/** Play a fixed seed against a target for a while and record every trigger pull. */
function play(seed: number, seconds = 60, dt = 1 / 60) {
  const g = new AutoGunner(seed);
  const target: Target = {
    id: 1,
    centre: new THREE.Vector3(0, 1, -12),
    radius: 0.8,
  };
  const rest = new THREE.Vector3(3, 2, -20);
  const shots: { t: number; miss: boolean }[] = [];
  const firstAim: number[] = [];

  for (let t = 0; t < seconds; t += dt) {
    // A fresh target every 3 seconds, somewhere new on the road.
    if (Math.floor(t / 3) !== Math.floor((t - dt) / 3)) {
      target.id++;
      target.centre.set(Math.sin(t) * 4, 1, -12 - (t % 5));
    }

    const s = g.update(dt, target, rest);

    if (g.aim && firstAim.length < 2) {
      firstAim.push(g.aim.distanceTo(target.centre));
    }

    if (s) {
      shots.push({ t, miss: s.at.distanceTo(target.centre) > target.radius });
    }
  }

  const gaps = shots.slice(1).map((s, i) => s.t - shots[i]!.t);

  return { shots, gaps, firstAim };
}

describe("autoplay shoots like a person", () => {
  const { shots, gaps, firstAim } = play(7);

  it("fires steadily", () => {
    expect(shots.length).toBeGreaterThan(40);
  });

  it("varies the pause between shots", () => {
    const distinct = new Set(gaps.map((g) => g.toFixed(2)));

    expect(distinct.size).toBeGreaterThan(12);
    expect(Math.max(...gaps)).toBeGreaterThan(0.5);

    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(
      gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length,
    );

    expect(sd / mean).toBeGreaterThan(0.3);
  });

  it("sometimes misses, mostly hits", () => {
    const misses = shots.filter((s) => s.miss).length;

    expect(misses).toBeGreaterThan(0);
    expect(misses).toBeLessThan(shots.length / 2);
  });

  it("sometimes fires a short burst", () => {
    // A burst is two or more shots under 0.15 s apart.
    const quick = gaps.filter((g) => g < 0.15).length;

    expect(quick).toBeGreaterThan(2);
    expect(quick).toBeLessThan(gaps.length);
  });

  it("drifts onto a target rather than snapping to it", () => {
    expect(firstAim[0]).toBeGreaterThan(1);
    expect(firstAim[1]).toBeLessThan(firstAim[0]!);
    expect(firstAim[1]).toBeGreaterThan(0.5);
  });

  it("is the same with the same seed and different with another", () => {
    expect(play(7).shots).toEqual(shots);
    expect(play(8).shots).not.toEqual(shots);
  });
});
