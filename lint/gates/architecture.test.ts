// Proves the architecture gate (G14: coupling and hubs, archlint) is wired and kept honest. The probes plant a small project and run the
// real config over it: a module with 31 neighbours fails and one with 30 passes; a module with 8 importers and 8 imports of its own is a
// hub and 7 or 7 is not. The guards keep the ways out honest: the one coupling exemption is exactly the leaf named in exemptions.ts, it
// still earns it (no imports of its own), and a same-named file elsewhere gets no pass; `lcom` stays in the detector list with every file
// excluded from its findings, because dropping it changes what the cohesion rule (G13) sees.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { COUPLING_EXEMPT } from "./exemptions";
import { CONFIG, REPO, detectors, scan } from "./architecture.mjs";

const scratch: string[] = [];
const COUPLING_LIMIT = 30;
const HUB_LIMIT = 8;
/** A hub is a pass-through module: more complex than this and it is left to the size and complexity gates. */
const HUB_COMPLEXITY_CEILING = 5;
const NTH_IMPORTERS = 31;

afterAll(() => {
  for (const dir of scratch) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Plant these files in a fresh folder and give back its path. */
function plantDir(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "architecture-probe-"));

  scratch.push(root);

  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }

  return root;
}

/** Plant these files (path inside src → source), scan them with the real config and give back the finding for each rule by file. */
const plant = (files: Record<string, string>): string[] =>
  scan(plantDir(files)).map((f) => `${f.rule}:${f.file}`);

/** `count` leaf files, each exporting one value. */
const leaves = (count: number, prefix = "leaf") =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `${prefix}${i}.ts`,
      `export const v${i} = ${i};\n`,
    ]),
  );

/** One module that imports `count` leaves and so is coupled to all of them. */
const importer = (count: number) => ({
  ...leaves(count),
  "big.ts": `${Array.from({ length: count }, (_, i) => `import { v${i} } from "./leaf${i}.ts";`).join("\n")}\nexport const sum = ${Array.from({ length: count }, (_, i) => `v${i}`).join(" + ")};\n`,
});

/** One module `hub.ts` with `inCount` importers, `outCount` imports of its own and a function with `branches` decisions in it (complexity 1 + branches). */
const hubOf = (inCount: number, outCount: number, branches = 0) => ({
  ...leaves(outCount, "out"),
  ...Object.fromEntries(
    Array.from({ length: inCount }, (_, i) => [
      `in${i}.ts`,
      `import { hub } from "./hub.ts";\nexport const i${i} = hub();\n`,
    ]),
  ),
  "hub.ts": `${Array.from({ length: outCount }, (_, i) => `import { v${i} } from "./out${i}.ts";`).join("\n")}\nexport const hub = () => {\n  let total = 0;\n${Array.from({ length: branches }, (_, i) => `  if (v${i % outCount} > ${i}) {\n    total += ${i};\n  }`).join("\n")}\n  return total + v0;\n};\n`,
});

/** A module `file` that nothing imports and that imports nothing, with `count` files importing it. */
const leafWithImporters = (file: string, count: number) => ({
  [file]: "export const guard = 1;\n",
  ...Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `user${i}.ts`,
      `import { guard } from "./${file}";\nexport const u${i} = guard;\n`,
    ]),
  ),
});

describe("the real code", () => {
  it("has no coupling or hub finding", () => {
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

  it("counts a re-export as a neighbour", () => {
    const count = COUPLING_LIMIT + 1;

    expect(
      plant({
        ...leaves(count),
        "reexports.ts": `export const own = 1;\n${Array.from({ length: count }, (_, i) => `export { v${i} } from "./leaf${i}.ts";`).join("\n")}\n`,
      }),
    ).toEqual(["high-coupling:src/reexports.ts"]);
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
  const check = (src: string) =>
    spawnSync(process.execPath, ["scripts/check-architecture.mjs", src], {
      cwd: REPO,
      encoding: "utf8",
    });

  it("exits 1 and says what to do when a rule is broken", () => {
    const run = check(plantDir(importer(COUPLING_LIMIT + 1)));

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("src/big.ts: high-coupling");
    expect(run.stderr).toContain("Split it");
  });

  it("exits 0 when nothing is broken", () => {
    expect(check(plantDir(importer(COUPLING_LIMIT))).status).toBe(0);
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
    expect(config.rules.high_coupling.max_cbo).toBe(COUPLING_LIMIT);
    expect(config.rules.hub_module).toMatchObject({
      min_fan_in: HUB_LIMIT,
      min_fan_out: HUB_LIMIT,
      max_complexity: HUB_COMPLEXITY_CEILING,
    });
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
