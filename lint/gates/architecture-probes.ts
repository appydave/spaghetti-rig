// What the architecture gate's tests share: planting a small project in a scratch folder, scanning it with the real config, and the
// shapes the probes plant (leaves, an importer, a hub, a leaf with importers, independent exports).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scan } from "./architecture.mjs";

const scratch: string[] = [];

export const COUPLING_LIMIT = 30;
export const HUB_LIMIT = 8;
/** A hub is a pass-through module: more complex than this and it is left to the size and complexity gates. */
export const HUB_COMPLEXITY_CEILING = 5;

/** Remove every folder planted so far. */
export function cleanScratch() {
  for (const dir of scratch) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Plant these files in a fresh folder and give back its path. */
export function plantDir(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "architecture-probe-"));

  scratch.push(root);

  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }

  return root;
}

/** Plant these files (path inside src → source), scan them with the real config and give back the finding for each rule by file. */
export const plant = (files: Record<string, string>): string[] =>
  scan(plantDir(files)).map((f) => `${f.rule}:${f.file}`);

/** `count` leaf files, each exporting one value. */
export const leaves = (count: number, prefix = "leaf") =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `${prefix}${i}.ts`,
      `export const v${i} = ${i};\n`,
    ]),
  );

/** One module that imports `count` leaves and so is coupled to all of them. */
export const importer = (count: number) => ({
  ...leaves(count),
  "big.ts": `${Array.from({ length: count }, (_, i) => `import { v${i} } from "./leaf${i}.ts";`).join("\n")}\nexport const sum = ${Array.from({ length: count }, (_, i) => `v${i}`).join(" + ")};\n`,
});

/** One module `hub.ts` with `inCount` importers, `outCount` imports of its own and a function with `branches` decisions in it (complexity 1 + branches). */
export const hubOf = (inCount: number, outCount: number, branches = 0) => ({
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
export const leafWithImporters = (file: string, count: number) => ({
  [file]: "export const guard = 1;\n",
  ...Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `user${i}.ts`,
      `import { guard } from "./${file}";\nexport const u${i} = guard;\n`,
    ]),
  ),
});

/** `count` exports, each a constant of its own: nothing links one to another, so each is a group. */
export const independent = (count: number) =>
  Array.from({ length: count }, (_, i) => `export const k${i} = ${i};`).join(
    "\n",
  );
