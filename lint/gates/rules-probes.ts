// The planted violations for the magic-number and colour rules (rules.test.ts): one per form, each with a passing twin.

export const NUMBER = "eslint(no-magic-numbers)";
export const COLOUR = "strict-colors(no-color-literals)";

/** A probe: its name, where it sits in the sandbox repo, its source and the findings expected for it (none = allowed). */
export type Probe = readonly [string, string, string, readonly string[]];

const file = (...rows: string[]): string => `${rows.join("\n")}\n`;
const THREE = 'import * as THREE from "three";';
// Built from pieces so this file does not trip the suppression scan it exercises.
const OFF = `${"eslint"}-${"disable"}-next-line`;

export const NUMBER_PROBES: readonly Probe[] = [
  [
    "number: a bare number in production code",
    "src/probe/bare.ts",
    file(
      "export function area(width: number): number {",
      "  return width * 7;",
      "}",
    ),
    [NUMBER],
  ],
  [
    "number: a named constant is clean",
    "src/probe/named.ts",
    file(
      "const SPAN = 7;",
      "",
      "export function area(width: number): number {",
      "  return width * SPAN;",
      "}",
    ),
    [],
  ],
  [
    "number: a number in an object (detectObjects)",
    "src/probe/object.ts",
    file("export const tuning = { speed: 5 };"),
    [NUMBER],
  ],
  [
    "number: the object field named is clean",
    "src/probe/object-named.ts",
    file("const SPEED = 5;", "", "export const tuning = { speed: SPEED };"),
    [],
  ],
  [
    "number: let instead of const (enforceConst)",
    "src/probe/let.ts",
    file("export let limit = 5;"),
    [NUMBER],
  ],
  [
    "number: const is clean",
    "src/probe/const.ts",
    file("export const LIMIT = 5;"),
    [],
  ],
  [
    "number: a default value is a magic number too (ignoreDefaultValues is off)",
    "src/probe/default.ts",
    file("export function pick(count = 5): number {", "  return count;", "}"),
    [NUMBER],
  ],
  [
    "number: 0, 1, -1 and 2 are allowed",
    "src/probe/ignored.ts",
    file(
      "export function mid(a: number, b: number): number {",
      "  return (a + b) / 2 + 1 + 0 + -1;",
      "}",
    ),
    [],
  ],
  [
    "number: 3 is not on the ignore list",
    "src/probe/three.ts",
    file("export function third(a: number): number {", "  return a / 3;", "}"),
    [NUMBER],
  ],
  [
    "number: a numeric literal type and an enum value are allowed",
    "src/probe/types.ts",
    file(
      "export type Five = 5;",
      "",
      "export enum Level {",
      "  High = 5,",
      "}",
    ),
    [],
  ],
  [
    "number: tests may use numbers (tests/)",
    "tests/probe.spec.ts",
    file("export const list = [5, 6, 7];"),
    [],
  ],
  [
    "number: tests may use numbers (*.test.ts)",
    "src/probe/n.test.ts",
    file("export const list = [5, 6, 7];"),
    [],
  ],
];

export const COLOUR_PROBES: readonly Probe[] = [
  [
    "colour: a hex string in a Color constructor",
    "src/probe/c-ctor.ts",
    file(THREE, "", 'export const c = new THREE.Color("#ff0000");'),
    [COLOUR],
  ],
  [
    "colour: a palette name in a Color constructor is clean",
    "src/probe/c-ctor-ok.ts",
    file(
      THREE,
      'import { RED } from "./palette";',
      "",
      "export const c = new THREE.Color(RED);",
    ),
    [],
  ],
  [
    "colour: a numeric hex in a Color constructor",
    "src/probe/c-number.ts",
    file(THREE, "", "export const c = new THREE.Color(0xff0000);"),
    [COLOUR, NUMBER],
  ],
  [
    "colour: a number in a light constructor",
    "src/probe/c-light.ts",
    file(THREE, "", "export const light = new THREE.PointLight(0xffae59, 1);"),
    [COLOUR, NUMBER],
  ],
  [
    "colour: a number passed to setHex",
    "src/probe/c-sethex.ts",
    file(
      "export function paint(mat: { color: { setHex(n: number): void } }): void {",
      "  mat.color.setHex(0xff0000);",
      "}",
    ),
    [COLOUR, NUMBER],
  ],
  [
    "colour: a named colour in a colour-named field",
    "src/probe/c-field.ts",
    file(
      THREE,
      "",
      'export const m = new THREE.MeshBasicMaterial({ color: "red" });',
    ),
    [COLOUR],
  ],
  [
    "colour: the same word in a field not named like a colour is clean",
    "src/probe/c-field-ok.ts",
    file(
      THREE,
      "",
      'export const m = new THREE.MeshBasicMaterial({ name: "red" });',
    ),
    [],
  ],
  [
    "colour: a Color assigned to an unnamed variable (alias check)",
    "src/probe/c-assigned.ts",
    file(
      THREE,
      "",
      "let accent: THREE.Color | undefined;",
      "",
      "accent = new THREE.Color();",
      "accent.set(0, 1, 0);",
    ),
    [COLOUR, COLOUR, COLOUR],
  ],
  [
    "colour: a template literal that builds a hex",
    "src/probe/c-template.ts",
    file(
      THREE,
      "",
      "export function tint(hex: string): THREE.Color {",
      "  return new THREE.Color(`#${hex}ff`);",
      "}",
    ),
    [COLOUR],
  ],
  [
    "colour: an rgb() string",
    "src/probe/c-rgb.ts",
    file(THREE, "", 'export const c = new THREE.Color("rgb(10, 20, 30)");'),
    [COLOUR],
  ],
  [
    "colour: a named colour in a colour context",
    "src/probe/c-named.ts",
    file(THREE, "", 'export const c = new THREE.Color("red");'),
    [COLOUR],
  ],
  [
    "colour: the same word outside a colour context is clean",
    "src/probe/c-word.ts",
    file('export const label = "red";'),
    [],
  ],
  [
    "colour: a Color kept in an unnamed variable (alias check)",
    "src/probe/c-alias.ts",
    file(
      THREE,
      "",
      "const accent = new THREE.Color();",
      "",
      "accent.set(0, 1, 0);",
    ),
    [COLOUR, COLOUR, COLOUR],
  ],
  [
    "colour: a parameter annotated Color",
    "src/probe/c-param.ts",
    file(
      THREE,
      "",
      "export function paint(tone: THREE.Color): void {",
      "  tone.set(0, 1, 0);",
      "}",
    ),
    [COLOUR, COLOUR, COLOUR],
  ],
  [
    "colour: KNOWN MISS, a callback parameter whose Color type is only inferred",
    "src/probe/c-inferred.ts",
    file(
      THREE,
      "",
      "export function paintAll(list: THREE.Color[]): void {",
      "  list.forEach((c) => c.set(0, 1, 0));",
      "}",
    ),
    [],
  ],
  [
    "colour: the palette module may hold literals",
    "src/world/palette.ts",
    file('export const RED = "#ff0000";'),
    [],
  ],
  [
    "colour: tests are covered too",
    "tests/colour.spec.ts",
    file(THREE, "", 'export const c = new THREE.Color("#ffffff");'),
    [COLOUR],
  ],
];

export const PLANTED: readonly Probe[] = [
  [
    "planted disable: magic number",
    "src/probe/off-number.ts",
    file(`// ${OFF} no-magic-numbers`, "export const x = 7;"),
    [],
  ],
  [
    "planted disable: colour",
    "src/probe/off-colour.ts",
    file(
      THREE,
      "",
      `// ${OFF} strict-colors/no-color-literals`,
      'export const c = new THREE.Color("#ffffff");',
    ),
    [],
  ],
];
