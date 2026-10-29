// The architecture gates (G13 module cohesion, G14 coupling and hubs, G15 stable dependencies): archlint 0.17.1 run over a disposable
// copy of src/ without its tests, with the rules in lint/architecture/archlint.json. One home for the run, so `npm run lint:architecture`
// and the gate's probes (architecture.test.ts) read the same findings.
//   A hub is a pass-through module: 8+ importers, 8+ imports of its own and complexity <= 5. A logic-heavy module with the same fan is left
//   to the size and complexity gates.
//   The copy is how tests are left out: archlint would still count ignored test imports in its graph metrics.
//   The detector list is the config's own rule list. `lcom` is in it on purpose and every file is excluded from its findings: Omer's
//   config does the same, because dropping it changes what the module-cohesion rule (G13) sees. Do not "clean it up".
//   Module cohesion: a module with 5+ exports in 3+ groups fails. Two exports are in one group when one's parameter or return type names the other,
//   or one calls the other; a field type inside an interface is not a link, which is why a few type-only files are exempt by name (exemptions.ts).
//   Stable dependencies: a module (5+ imports and importers together) that imports a module more than 0.3 less stable than itself fails.
//   Instability is imports / (imports + importers), so a module many files import must not import one few files import.
//   A module that holds only types or only `export … from` lines is not in archlint's graph at all, so edges into and out of it are not counted.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

export const REPO = resolve(import.meta.dirname, "../..");
export const CONFIG = join(REPO, "lint/architecture/archlint.json");

const ARCHLINT = resolve(REPO, "node_modules/@archlinter/cli/bin/archlint.js");
/** The most output of one archlint run read back: 2 to the power of this many bytes. */
const OUTPUT_BITS = 26;
const MAX_OUTPUT_BYTES = 1 << OUTPUT_BITS;
/** How much of a failed run's output goes into an error message. */
const ERROR_TAIL = 400;
/** A test file, or a `test/` or `tests/` folder, inside src: not part of the shipped design. */
const TEST_FILE = /(?:\.(?:test|spec)\.[^/]+$)|(?:(?:^|\/)tests?\/)/;

/** The rule names a finding's archlint type is filed under, and what to do about each. */
export const RULES = {
  ScatteredModule: {
    rule: "module-cohesion",
    hint: "This module has 5+ exports that fall into 3+ unrelated groups (no export uses another or shares a type with it), so a reader opens it for one thing and scrolls past the rest. Move each group to the module named for it, or give the exports the real link they lack. Do not add the file to lint/architecture/archlint.json: the exclusions are named by file and the list is pinned.",
  },
  sdp_violation: {
    rule: "stable-dependencies",
    hint: "This module is widely depended on but itself depends on a module that changes more often than it does (stable depends on unstable). Inject the dependency (take it as a parameter or an interface the caller supplies) or move the shared thing to the stable side, so what many modules import never imports what changes. Do not lower the thresholds in lint/architecture/archlint.json.",
  },
  HighCoupling: {
    rule: "high-coupling",
    hint: "Too many modules import this one or are imported by it. Split it by what each importer needs, or hand the importers a narrower module. Do not add it to lint/architecture/archlint.json: only a leaf with no imports of its own may be excluded, and the list is pinned.",
  },
  HubModule: {
    rule: "hub",
    hint: "This module is both widely imported and widely importing, so every change reaches both sides. Split it so one half is only imported and the other only imports. Do not lower the thresholds in lint/architecture/archlint.json.",
  },
};

/** The detectors to run: the config's rule names, one list for the config and the run. */
export const detectors = () =>
  Object.keys(JSON.parse(readFileSync(CONFIG, "utf8")).rules);

/** Run archlint over a copy of `srcDir` (a folder named src) and give back its findings, with paths relative to its parent. `rules` is the detector list (the wiring test drops one). */
export function scan(srcDir = join(REPO, "src"), rules = detectors()) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "archlint-")));

  try {
    cpSync(srcDir, join(tmp, "src"), {
      recursive: true,
      filter: (path) =>
        !TEST_FILE.test(relative(srcDir, path).replaceAll("\\", "/")),
    });
    // archlint resolves aliases against the nearest package root.
    writeFileSync(join(tmp, "package.json"), "{}");

    const run = spawnSync(
      process.execPath,
      [
        ARCHLINT,
        "scan",
        join(tmp, "src"),
        "--config",
        CONFIG,
        "--detectors",
        rules.join(","),
        "--no-cache",
        "--no-git",
        "--format",
        "json",
      ],
      { encoding: "utf8", maxBuffer: MAX_OUTPUT_BYTES, cwd: tmp },
    );

    if (run.error || !run.stdout.startsWith("{")) {
      throw new Error(
        `archlint did not produce a report: ${run.error?.message ?? run.stderr.slice(0, ERROR_TAIL)}`,
      );
    }

    return JSON.parse(run.stdout).smells.map((smell) => {
      const type = Object.keys(RULES).find((t) => smell.type.startsWith(t));

      if (!type) {
        throw new Error(
          `archlint reported a finding this gate has no message for: ${smell.type}`,
        );
      }

      return {
        type,
        rule: RULES[type].rule,
        file: relative(tmp, smell.files[0]),
        metrics: Object.assign({}, ...smell.metrics),
      };
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** One finding as a line the next agent can act on. */
export const describe = ({ type, rule, file, metrics }) =>
  `${file}: ${rule} ${JSON.stringify(metrics)}. ${RULES[type].hint}`;
