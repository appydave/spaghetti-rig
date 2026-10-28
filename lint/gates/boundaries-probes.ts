// The planted files for the boundaries gate test (boundaries.test.ts): a crossing out of every layer, every import form on one layer,
// the imports each layer may make, and a relative import inside a layer (G10 must still fire there).
import type { Probe } from "./support/probe-gate";

export const BOUNDARIES_CODE = "eslint(no-restricted-imports)";

const FAILS = [BOUNDARIES_CODE];
const PASSES: readonly string[] = [];

const file = (...rows: string[]): string => `${rows.join("\n")}\n`;
const importing = (from: string): string =>
  file(`import { a } from "#root/src/${from}";`, "export const b = a;");

/** One crossing per layer: the layer, the file planted in it, and an import it may not make. */
const CROSSINGS: readonly [string, string, string][] = [
  ["show", "src/show/probe.ts", "app/keys.ts"],
  ["show (main.ts)", "src/show/probe-main.ts", "main.ts"],
  ["world", "src/world/probe.ts", "show/director.ts"],
  ["world (app)", "src/world/steps/probe.ts", "app/keys.ts"],
  ["ui", "src/ui/probe.ts", "world/world.ts"],
  ["ui (audio)", "src/ui/probe-audio.ts", "audio/audio.ts"],
  ["audio", "src/audio/probe.ts", "world/world.ts"],
  ["audio (ui)", "src/audio/probe-ui.ts", "ui/card.ts"],
  ["content", "src/content/probe.ts", "world/world.ts"],
  ["content (audio)", "src/content/probe-audio.ts", "audio/audio.ts"],
  ["a root utility", "src/nth.ts", "content/load.ts"],
];

/** What each layer may import. */
const ALLOWED: readonly [string, string, string][] = [
  ["show imports world", "src/show/probe-ok.ts", "world/world.ts"],
  ["world imports content", "src/world/probe-ok.ts", "content/script.ts"],
  ["world imports ui", "src/world/probe-ok2.ts", "ui/card.ts"],
  ["audio imports content", "src/audio/probe-ok.ts", "content/load.ts"],
  ["content imports a root utility", "src/content/probe-ok.ts", "nth.ts"],
  ["the app imports anything", "src/app/probe-ok.ts", "show/director.ts"],
];

/** Every way a world file can reach show. */
const FORMS: readonly [string, string][] = [
  [
    "an import type",
    'import type { Step } from "#root/src/show/director.ts";\nexport type B = Step;',
  ],
  ["an export-from", 'export { Director } from "#root/src/show/director.ts";'],
  ["an export-star", 'export * from "#root/src/show/director.ts";'],
  [
    "a dynamic import",
    'export const b = () => import("#root/src/show/director.ts");',
  ],
];

export const BOUNDARIES_PROBES: readonly Probe[] = [
  ...CROSSINGS.map(([layer, path, to]): Probe => [
    `${layer} may not import src/${to}`,
    path,
    importing(to),
    FAILS,
  ]),
  ...FORMS.map(([form, source], i): Probe => [
    `world reaching show by ${form} fails`,
    `src/world/probe-form-${i}.ts`,
    file(source),
    FAILS,
  ]),
  ...ALLOWED.map(([name, path, to]): Probe => [
    `${name}: passes`,
    path,
    importing(to),
    PASSES,
  ]),
  [
    "a relative import inside a layer still fails (G10 kept in the layer block)",
    "src/content/probe-relative.ts",
    file('import { a } from "./a.ts";', "export const b = a;"),
    FAILS,
  ],
];
