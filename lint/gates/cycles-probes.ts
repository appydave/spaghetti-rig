// The planted files for the cycles gate test (cycles.test.ts): a value cycle, a type-only cycle (R9: it counts), a three-file cycle, and
// imports that run one way. The sandbox has no package.json, so the probes import each other by relative path (G10 reports those too,
// under its own code, which this gate does not count).
import type { Probe } from "./support/probe-gate";

export const CYCLES_CODE = "import(no-cycle)";

const FAILS = [CYCLES_CODE];
const PASSES: readonly string[] = [];

const file = (...rows: string[]): string => `${rows.join("\n")}\n`;

export const CYCLES_PROBES: readonly Probe[] = [
  [
    "a value cycle fails (one side)",
    "src/cycle-value/a.ts",
    file('import { b } from "./b.ts";', "export const a = () => b;"),
    FAILS,
  ],
  [
    "a value cycle fails (the other side)",
    "src/cycle-value/b.ts",
    file('import { a } from "./a.ts";', "export const b = () => a;"),
    FAILS,
  ],
  [
    "a type-only cycle fails: the model imports the motion, the motion imports the model's type",
    "src/cycle-type/model.ts",
    file(
      'import { step } from "./motion.ts";',
      "export class Model {",
      "  tick() {",
      "    step(this);",
      "  }",
      "}",
    ),
    FAILS,
  ],
  [
    "a type-only cycle fails (the type side)",
    "src/cycle-type/motion.ts",
    file(
      'import type { Model } from "./model.ts";',
      "export const step = (m: Model) => m;",
    ),
    FAILS,
  ],
  [
    "a three-file cycle fails",
    "src/cycle-three/x.ts",
    file('import { z } from "./z.ts";', "export const x = () => z;"),
    FAILS,
  ],
  [
    "a three-file cycle fails (middle)",
    "src/cycle-three/y.ts",
    file('import { x } from "./x.ts";', "export const y = () => x;"),
    FAILS,
  ],
  [
    "a three-file cycle fails (last)",
    "src/cycle-three/z.ts",
    file('import { y } from "./y.ts";', "export const z = () => y;"),
    FAILS,
  ],
  [
    "imports that run one way pass (the top)",
    "src/one-way/top.ts",
    file('import { low } from "./low.ts";', "export const top = () => low;"),
    PASSES,
  ],
  [
    "imports that run one way pass (the bottom)",
    "src/one-way/low.ts",
    file("export const low = 1;"),
    PASSES,
  ],
];
