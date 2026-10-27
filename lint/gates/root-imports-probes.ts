// The planted files for the root-imports gate test (root-imports.test.ts): one probe for each way a file can import something, and the
// shapes the gate must let through.
import type { Probe } from "./support/probe-gate";

export const ROOT_IMPORTS_CODE = "eslint(no-restricted-imports)";

const FAILS = [ROOT_IMPORTS_CODE];
const PASSES: readonly string[] = [];

const file = (...rows: string[]): string => `${rows.join("\n")}\n`;

export const ROOT_IMPORTS_PROBES: readonly Probe[] = [
  [
    "a plain relative import fails",
    "src/probe-plain.ts",
    file('import { a } from "./a.ts";', "export const b = a;"),
    FAILS,
  ],
  [
    "a parent-folder import fails",
    "src/probe-parent.ts",
    file('import { a } from "../a.ts";', "export const b = a;"),
    FAILS,
  ],
  [
    "a relative type import fails",
    "src/probe-type.ts",
    file('import type { A } from "./a.ts";', "export type B = A;"),
    FAILS,
  ],
  [
    "a relative export-from fails",
    "src/probe-export-from.ts",
    file('export { a } from "./a.ts";'),
    FAILS,
  ],
  [
    "a relative export-star fails",
    "src/probe-export-star.ts",
    file('export * from "./a.ts";'),
    FAILS,
  ],
  [
    "a relative dynamic import fails",
    "src/probe-dynamic.ts",
    file('export const load = () => import("./a.ts");'),
    FAILS,
  ],
  [
    "a relative json import fails",
    "src/probe-json.ts",
    file('import data from "./data.json";', "export const d = data;"),
    FAILS,
  ],
  [
    "a relative side-effect import fails",
    "src/probe-side-effect.ts",
    file('import "./a.ts";'),
    FAILS,
  ],
  [
    "a relative .tsx import fails",
    "src/probe-tsx.ts",
    file('import { A } from "./a.tsx";', "export const b = A;"),
    FAILS,
  ],
  [
    "a relative import in tests/ fails",
    "tests/probe-tests.ts",
    file('import { a } from "../src/a.ts";', "export const b = a;"),
    FAILS,
  ],
  [
    "a root import passes",
    "src/probe-root.ts",
    file('import { a } from "#root/src/a.ts";', "export const b = a;"),
    PASSES,
  ],
  [
    "a package import passes",
    "src/probe-package.ts",
    file('import { join } from "node:path";', "export const j = join;"),
    PASSES,
  ],
  [
    "a relative import in lint/ passes (exempt: it runs outside the package)",
    "lint/probe-tooling.ts",
    file('import { a } from "./a.ts";', "export const b = a;"),
    PASSES,
  ],
  [
    "a relative import in scripts/ passes (exempt)",
    "scripts/probe-script.mjs",
    file('import { a } from "./a.mjs";', "export const b = a;"),
    PASSES,
  ],
  [
    "a relative import in a root config file passes (exempt)",
    "probe.config.ts",
    file('import { a } from "./src/a.ts";', "export const b = a;"),
    PASSES,
  ],
];
