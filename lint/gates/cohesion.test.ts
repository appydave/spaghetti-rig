// Proves the module-cohesion gate (G13, archlint): 5 or more exports in 3 or more groups fails, the named exemptions pass and nothing else does,
// and `lcom` stays in the detector list because the link between two exports through a type annotation only exists while it runs.
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { COHESION_EXEMPT } from "./exemptions";
import { REPO, detectors, scan } from "./architecture.mjs";
import {
  HUB_LIMIT,
  checkScript,
  cleanScratch,
  hubOf,
  independent,
  leaves,
  plant,
  plantDir,
} from "./architecture-probes";

afterAll(cleanScratch);

describe("module cohesion", () => {
  it("fails a module with 5 exports in 5 groups", () => {
    expect(plant({ "scattered.ts": independent(5) })).toEqual([
      "module-cohesion:src/scattered.ts",
    ]);
  });

  it("passes 4 exports in 4 groups: below the 5-export floor", () => {
    expect(plant({ "small.ts": independent(4) })).toEqual([]);
  });

  it("passes 5 exports in 2 groups (a calls b; c and e call d)", () => {
    expect(
      plant({
        "pairs.ts":
          "export const b = () => 1;\nexport const a = () => b();\nexport const d = () => 2;\nexport const c = () => d();\nexport const e = () => d();\n",
      }),
    ).toEqual([]);
  });

  it("tells the next agent what to do (the check script's message)", () => {
    const run = checkScript(plantDir({ "scattered.ts": independent(5) }));

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("src/scattered.ts: module-cohesion");
    expect(run.stderr).toContain("Move each group to the module named for it");
  });

  it("fails 5 exports in 3 groups", () => {
    expect(
      plant({
        "three.ts":
          "export const b = () => 1;\nexport const a = () => b();\nexport const d = () => 2;\nexport const c = () => d();\nexport const e = 3;\n",
      }),
    ).toEqual(["module-cohesion:src/three.ts"]);
  });

  it("links exports that share a type only through a parameter annotation, and only while lcom runs", () => {
    const files = {
      "typed.ts":
        "export interface Opts {\n  n: number;\n}\nexport const a = (o: Opts) => o.n;\nexport const b = (o: Opts) => o.n + 1;\nexport const c = (o: Opts) => o.n + 2;\nexport const d = (o: Opts) => o.n + 3;\n",
    };
    const without = detectors().filter((rule) => rule !== "lcom");

    expect(plant(files)).toEqual([]);
    expect(
      scan(plantDir(files), without).map((f) => `${f.rule}:${f.file}`),
    ).toEqual(["module-cohesion:src/typed.ts"]);
  });

  it("does not link exports through an interface's field types", () => {
    expect(
      plant({
        "fields.ts":
          "export interface Pose {\n  x: number;\n}\nexport interface Motion {\n  y: number;\n}\nexport interface Animated {\n  pose: Pose;\n  motion: Motion;\n}\nexport const one = 1;\nexport const two = 2;\n",
      }),
    ).toEqual(["module-cohesion:src/fields.ts"]);
  });

  it("passes each file named in exemptions.ts, wherever it sits in the planted tree", () => {
    const named = Object.fromEntries(
      Object.keys(COHESION_EXEMPT).map((file) => [
        file.replace(/^src\//, ""),
        independent(5),
      ]),
    );

    expect(plant(named)).toEqual([]);
  });

  it("fails a new types.ts, a *-types.ts and a palette.ts in another folder", () => {
    expect(
      plant({
        "types.ts": independent(5),
        "fresh-types.ts": independent(5),
        "sub/palette.ts": independent(5),
      }).sort(),
    ).toEqual([
      "module-cohesion:src/fresh-types.ts",
      "module-cohesion:src/sub/palette.ts",
      "module-cohesion:src/types.ts",
    ]);
  });

  it("has a different answer without lcom on the real code: the detector stays in the list", () => {
    const without = detectors().filter((rule) => rule !== "lcom");

    expect(scan(join(REPO, "src"), without).length).toBeGreaterThan(0);
  });
});

// archlint's graph does not see a module of `export … from` lines, so G13 and G14 cannot flag a barrel or the hub behind one. That stays
// true and is pinned here; what catches the barrel is the exports/no-reexport oxlint rule (lint/gates/export-policy.mjs, proved by
// reexport.test.ts), which fails the re-export itself in production src.
describe("what the graph does not see (barrels; exports/no-reexport catches them instead)", () => {
  const BARREL_SIZE = 6;
  const barrelOf = (count: number) =>
    Array.from(
      { length: count },
      (_, i) => `export { v${i} } from "./leaf${i}.ts";`,
    ).join("\n");

  it("does not count a file of only `export … from` lines as scattered", () => {
    expect(
      plant({ ...leaves(BARREL_SIZE), "barrel.ts": barrelOf(BARREL_SIZE) }),
    ).toEqual([]);
  });

  it("does not flag a hub whose importers reach it through a barrel: the graph is blind there, and the no-reexport rule fails the barrel", () => {
    const files = hubOf(0, HUB_LIMIT);
    const users = Object.fromEntries(
      Array.from({ length: HUB_LIMIT }, (_, i) => [
        `in${i}.ts`,
        `import { hub } from "./barrel.ts";\nexport const i${i} = hub();\n`,
      ]),
    );

    expect(
      plant({
        ...files,
        ...users,
        "barrel.ts": 'export { hub } from "./hub.ts";\n',
      }),
    ).toEqual([]);
    expect(plant(hubOf(HUB_LIMIT, HUB_LIMIT))).toEqual(["hub:src/hub.ts"]);
  });
});
