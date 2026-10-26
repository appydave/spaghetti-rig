// The planted forms of a colour `set` call (rules.test.ts): which receivers and which arguments make a literal a colour. Named colours
// are used because a hex string is flagged wherever it sits, so only a named colour shows whether the context was recognised.
import { COLOUR, file, THREE, type Probe } from "./rules-probes";

export const COLOUR_SET_PROBES: readonly Probe[] = [
  [
    "colour: set on a colour-named field",
    "src/probe/c-field-set.ts",
    file(
      THREE,
      "",
      "declare const material: { color: THREE.Color };",
      "",
      'material.color.set("red");',
    ),
    [COLOUR],
  ],
  [
    "colour: set on a new Color",
    "src/probe/c-new-set.ts",
    file(THREE, "", 'export const c = new THREE.Color().set("red");'),
    [COLOUR],
  ],
  [
    "colour: set on something that is not a colour is clean",
    "src/probe/c-other-set.ts",
    file(
      "declare const names: Map<string, string>;",
      "",
      'names.set("red", "blue");',
    ),
    [],
  ],
  [
    "colour: a fourth argument of set is not a channel, so it is clean",
    "src/probe/c-set-fourth.ts",
    file(
      THREE,
      "",
      "declare const material: { color: THREE.Color };",
      "",
      'material.color.set("a", "b", "c", "red");',
    ),
    [],
  ],
  [
    "colour: another method on a colour is clean",
    "src/probe/c-other-method.ts",
    file(
      THREE,
      "",
      "declare const material: { color: THREE.Color };",
      "",
      'material.color.toJSON("red");',
    ),
    [],
  ],
];
