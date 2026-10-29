// Proves the coupling and hub gates (G14, archlint) are wired and kept honest, and that the one config also states G13's thresholds and exemptions
// (cohesion.test.ts holds the cohesion probes). The probes plant a small project and run the real config over it: a module with 31 neighbours fails
// and one with 30 passes; a module with 8 importers and 8 imports of its own is a hub and 7 or 7 is not. The guards keep the ways out honest: the
// exemptions are exactly the files named in exemptions.ts, the coupling exemption still earns it (no imports of its own), a same-named file
// elsewhere gets no pass, and `lcom` stays in the detector list with every file excluded from its findings.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { COHESION_EXEMPT, COUPLING_EXEMPT } from "./exemptions";
import { CONFIG, REPO, detectors, scan } from "./architecture.mjs";
import {
  COUPLING_LIMIT,
  HUB_COMPLEXITY_CEILING,
  HUB_LIMIT,
  checkScript,
  cleanScratch,
  hubOf,
  importer,
  leafWithImporters,
  leaves,
  plant,
  plantDir,
} from "./architecture-probes";

const NTH_IMPORTERS = 31;

afterAll(cleanScratch);

describe("the real code", () => {
  it("has no cohesion, coupling or hub finding", () => {
    expect(scan(join(REPO, "src"))).toEqual([]);
  });
});

describe("coupling", () => {
  it("fails a module that imports 31 others", () => {
    expect(plant(importer(COUPLING_LIMIT + 1))).toEqual([
      "high-coupling:src/big.ts",
    ]);
  });

  it("passes a module that imports 30", () => {
    expect(plant(importer(COUPLING_LIMIT))).toEqual([]);
  });

  it("counts a re-export as a neighbour (and, mixed with an export of its own, as an unrelated export too)", () => {
    const count = COUPLING_LIMIT + 1;

    expect(
      plant({
        ...leaves(count),
        "reexports.ts": `export const own = 1;\n${Array.from({ length: count }, (_, i) => `export { v${i} } from "./leaf${i}.ts";`).join("\n")}\n`,
      }).sort(),
    ).toEqual([
      "high-coupling:src/reexports.ts",
      "module-cohesion:src/reexports.ts",
    ]);
  });

  it("leaves the tests that import a module out of its count", () => {
    const files = leafWithImporters("guard.ts", NTH_IMPORTERS);
    const tests = Object.fromEntries(
      Object.entries(files).map(([path, source]) => [
        path.replace(/^user(\d+)\.ts$/, "user$1.test.ts"),
        source,
      ]),
    );

    expect(plant(tests)).toEqual([]);
  });

  it("fails a leaf with 31 importers when it is not the named file", () => {
    expect(plant(leafWithImporters("guard.ts", NTH_IMPORTERS))).toEqual([
      "high-coupling:src/guard.ts",
    ]);
  });

  it("passes the named leaf with 31 importers", () => {
    expect(plant(leafWithImporters("nth.ts", NTH_IMPORTERS))).toEqual([]);
  });

  it("gives a same-named file in another folder no pass", () => {
    expect(plant(leafWithImporters("sub/nth.ts", NTH_IMPORTERS))).toEqual([
      "high-coupling:src/sub/nth.ts",
    ]);
  });
});

describe("the check script", () => {
  it("exits 1 and says what to do when a rule is broken", () => {
    const run = checkScript(plantDir(importer(COUPLING_LIMIT + 1)));

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("src/big.ts: high-coupling");
    expect(run.stderr).toContain("Split it");
  });

  it("exits 0 when nothing is broken", () => {
    expect(checkScript(plantDir(importer(COUPLING_LIMIT))).status).toBe(0);
  });
});

describe("hubs", () => {
  it("fails a module with 8 importers and 8 imports", () => {
    expect(plant(hubOf(HUB_LIMIT, HUB_LIMIT))).toEqual(["hub:src/hub.ts"]);
  });

  it("fails a hub whose complexity is at the ceiling of 5", () => {
    expect(
      plant(hubOf(HUB_LIMIT, HUB_LIMIT, HUB_COMPLEXITY_CEILING - 1)),
    ).toEqual(["hub:src/hub.ts"]);
  });

  it("leaves a logic-heavy module with the same fan to the size and complexity gates (complexity 6)", () => {
    expect(plant(hubOf(HUB_LIMIT, HUB_LIMIT, HUB_COMPLEXITY_CEILING))).toEqual(
      [],
    );
  });

  it("passes 7 importers with 8 imports", () => {
    expect(plant(hubOf(HUB_LIMIT - 1, HUB_LIMIT))).toEqual([]);
  });

  it("passes 8 importers with 7 imports", () => {
    expect(plant(hubOf(HUB_LIMIT, HUB_LIMIT - 1))).toEqual([]);
  });
});

describe("the wiring", () => {
  const config = JSON.parse(readFileSync(CONFIG, "utf8"));

  it("runs the config's own rules as the detectors, lcom among them", () => {
    expect(detectors()).toEqual(Object.keys(config.rules));
    expect(detectors()).toContain("lcom");
  });

  it("excludes every file from lcom's findings", () => {
    expect(config.rules.lcom.exclude).toEqual(["**/*"]);
  });

  it("sets the thresholds the gate states", () => {
    expect(config.rules.module_cohesion).toMatchObject({
      min_exports: 5,
      max_components: 2,
    });
    expect(config.rules.sdp_violation).toMatchObject({
      min_fan_total: 5,
      instability_diff: 0.3,
    });
    expect(config.rules.high_coupling.max_cbo).toBe(COUPLING_LIMIT);
    expect(config.rules.hub_module).toMatchObject({
      min_fan_in: HUB_LIMIT,
      min_fan_out: HUB_LIMIT,
      max_complexity: HUB_COMPLEXITY_CEILING,
    });
  });

  it("exempts exactly the files named in exemptions.ts from cohesion, by path, with a reason each", () => {
    expect(config.rules.module_cohesion.exclude).toEqual(
      Object.keys(COHESION_EXEMPT).sort(),
    );
    expect(Object.keys(COHESION_EXEMPT).sort()).toEqual([
      "src/audio/types.ts",
      "src/content/types.ts",
      "src/world/motion/character-motion.ts",
      "src/world/motion/city-layout-types.ts",
      "src/world/palette.ts",
    ]);
    expect(Object.values(COHESION_EXEMPT).every((why) => why.length > 0)).toBe(
      true,
    );
    expect(
      Object.keys(COHESION_EXEMPT).every((f) => existsSync(join(REPO, f))),
    ).toBe(true);
  });

  it("exempts exactly the leaf named in exemptions.ts, by path and not by pattern", () => {
    expect(config.rules.high_coupling.exclude).toEqual(COUPLING_EXEMPT);
    expect(COUPLING_EXEMPT).toEqual(["src/nth.ts"]);
  });

  it("keeps the exempt leaf a leaf: no imports of its own", () => {
    for (const file of COUPLING_EXEMPT) {
      expect(existsSync(join(REPO, file))).toBe(true);
      expect(readFileSync(join(REPO, file), "utf8")).not.toMatch(
        /^\s*(import|export)\b[^\n]*\bfrom\b/m,
      );
    }
  });
});
