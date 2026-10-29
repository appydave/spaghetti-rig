// The planted files for the no-reexport gate test (reexport.test.ts): the barrel shapes the architect reproduced (pure by `export … from`,
// pure by `export *`, mixed, a hub reached through a barrel) and the import-then-export dodge must fail; a clean module, a type import that
// is not re-exported, and the files the rule leaves alone must pass.
import type { Probe } from "./support/probe-gate";

export const REEXPORT_CODE = "exports(no-reexport)";

const FAILS = [REEXPORT_CODE];
const PASSES: readonly string[] = [];

const file = (...rows: string[]): string => `${rows.join("\n")}\n`;

/** How many modules import the hub in the hub-through-a-barrel probe: G14's hub rule fires at 8 in and 8 out. */
const HUB_IMPORTERS = 8;

const hubImporters = (): Probe[] =>
  Array.from({ length: HUB_IMPORTERS }, (_, i) => [
    `the hub's importer ${i}, which imports the barrel, is not itself a re-export`,
    `src/hub/in${i}.ts`,
    file('import { hub } from "./index.ts";', `export const i${i} = hub();`),
    PASSES,
  ]);

export const REEXPORT_PROBES: readonly Probe[] = [
  [
    "a pure barrel of `export { x } from` fails",
    "src/probe-named.ts",
    file('export { a, b } from "./a.ts";'),
    FAILS,
  ],
  [
    "a type re-export (`export type { T } from`) fails",
    "src/probe-type-from.ts",
    file('export type { A } from "./a.ts";'),
    FAILS,
  ],
  [
    "a pure barrel of `export *` fails",
    "src/probe-star.ts",
    file('export * from "./a.ts";'),
    FAILS,
  ],
  [
    "`export * as ns from` fails",
    "src/probe-star-as.ts",
    file('export * as ns from "./a.ts";'),
    FAILS,
  ],
  [
    "a mixed module (its own code plus an `export { x } from`) fails",
    "src/probe-mixed.ts",
    file('export { a } from "./a.ts";', "export const own = 1;"),
    FAILS,
  ],
  [
    "importing a name and exporting it by name fails (the dodge `prefer-export-from` used to steer into)",
    "src/probe-import-then-export.ts",
    file('import { a } from "./a.ts";', "export { a };"),
    FAILS,
  ],
  [
    "importing a type and exporting it with `export type { }` fails",
    "src/probe-import-then-export-type.ts",
    file('import type { A } from "./a.ts";', "export type { A };"),
    FAILS,
  ],
  [
    "importing a namespace and exporting it fails",
    "src/probe-namespace.ts",
    file('import * as ns from "./a.ts";', "export { ns };"),
    FAILS,
  ],
  [
    "importing a name and exporting it under another name fails",
    "src/probe-renamed.ts",
    file('import { a } from "./a.ts";', "export { a as b };"),
    FAILS,
  ],
  [
    "the barrel in front of a hub (importers -> index.ts re-export -> hub.ts) fails at index.ts",
    "src/hub/index.ts",
    file('export { hub } from "./hub.ts";'),
    FAILS,
  ],
  [
    "the hub behind the barrel is a plain module and passes",
    "src/hub/hub.ts",
    file("export const hub = () => 1;"),
    PASSES,
  ],
  ...hubImporters(),
  [
    "a clean module that exports only what it defines passes",
    "src/probe-clean.ts",
    file("export const a = 1;", "export type B = number;"),
    PASSES,
  ],
  [
    "a type import that is not re-exported passes",
    "src/probe-type-import.ts",
    file('import type { A } from "./a.ts";', "export const b: A = 1;"),
    PASSES,
  ],
  [
    "using an import to make a new export passes",
    "src/probe-uses-import.ts",
    file('import { a } from "./a.ts";', "export const b = a + 1;"),
    PASSES,
  ],
  [
    "exporting a name defined here by name passes",
    "src/probe-local-named.ts",
    file("const a = 1;", "export { a };"),
    PASSES,
  ],
  [
    "a test file in src may re-export (tests are out of scope)",
    "src/probe-reexport.test.ts",
    file('export { a } from "./a.ts";'),
    PASSES,
  ],
  [
    "a file under lint/ may re-export (lint/ is out of scope)",
    "lint/probe-reexport.ts",
    file('export { a } from "./a.ts";'),
    PASSES,
  ],
];
