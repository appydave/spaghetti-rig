// Proves the stable-dependencies gate (G15, archlint sdp_violation): a module that many files import (stable) must not import a module that
// changes more than it does (unstable) by 0.3 or more of instability, once the two have 5 imports and importers between them. The probes plant
// the shape #130 fixed (a facade that constructs its own part), then the same pair under each cutoff.
import { afterAll, describe, expect, it } from "vitest";
import { detectors, scan } from "./architecture.mjs";
import {
  checkScript,
  cleanScratch,
  parentOfPart,
  plant,
  plantDir,
} from "./architecture-probes";

afterAll(cleanScratch);

const FOUR_USERS = 4;
const THREE_USERS = 3;
const BUSY_PART = 3;

describe("stable dependencies", () => {
  it("fails a parent that 4 files import and that constructs a part importing 3 modules (instability 0.2 against 0.75)", () => {
    expect(plant(parentOfPart(FOUR_USERS, BUSY_PART))).toEqual([
      "stable-dependencies:src/parent.ts",
    ]);
  });

  it("fails a gap of 0.33 (5 importers; the part imports 1 module)", () => {
    expect(plant(parentOfPart(FOUR_USERS + 1, 1))).toEqual([
      "stable-dependencies:src/parent.ts",
    ]);
  });

  it("passes a gap of 0.3 (4 importers; the part imports 1 module): only a gap over 0.3 fails", () => {
    expect(plant(parentOfPart(FOUR_USERS, 1))).toEqual([]);
  });

  it("passes the same pair under the fan cutoff (3 importers: 4 in all)", () => {
    expect(plant(parentOfPart(THREE_USERS, BUSY_PART))).toEqual([]);
  });

  it("passes when the part is as stable as the parent (it imports nothing)", () => {
    expect(plant(parentOfPart(FOUR_USERS, 0))).toEqual([]);
  });

  it("tells the next agent what to do instead", () => {
    const run = checkScript(plantDir(parentOfPart(FOUR_USERS, BUSY_PART)));

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("src/parent.ts: stable-dependencies");
    expect(run.stderr).toContain("Inject the dependency");
  });

  it("finds nothing once sdp_violation is dropped from the detectors: the rule is wired in", () => {
    const without = detectors().filter((rule) => rule !== "sdp_violation");

    expect(detectors()).toContain("sdp_violation");
    expect(
      scan(plantDir(parentOfPart(FOUR_USERS, BUSY_PART)), without),
    ).toEqual([]);
  });
});
