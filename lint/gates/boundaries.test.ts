// Proves the boundaries gate (G12, R15: oxlint) is wired: a crossing out of every layer fails in every import form, the imports each layer
// may make pass, and every layer block keeps G10's relative-import pattern. The probes run in a sandbox that mirrors the repo (the real
// .oxlintrc.json, node_modules), so changing the config breaks a test.
import { describe, expect, it } from "vitest";
import { BOUNDARIES_CODE, BOUNDARIES_PROBES } from "./boundaries-probes";
import { readConfig } from "./sandbox";
import { describeProbes } from "./support/probe-gate";

/** The layer blocks, top to bottom, by the files each covers. */
const LAYERS = [
  ["src/show/**"],
  ["src/world/**"],
  ["src/ui/**"],
  ["src/audio/**"],
  ["src/content/**"],
  ["src/nth.ts", "src/dom.ts", "src/loose.ts", "src/maths.ts"],
];
/** G10's pattern: a layer block replaces the top-level rule, so it has to carry it. */
const RELATIVE = "^\\.";

type Patterns = [string, { patterns: { regex: string; message: string }[] }];

describeProbes("boundaries", BOUNDARIES_PROBES, [BOUNDARIES_CODE]);

describe("boundaries layers", () => {
  const blocks = readConfig().overrides.filter((o) =>
    Array.isArray(o.rules?.["no-restricted-imports"]),
  );

  it("there is one block per layer, exactly these, in order", () => {
    expect(blocks.map((o) => o.files)).toEqual(LAYERS);
  });

  it("every layer block keeps G10's relative-import pattern and says what to do instead", () => {
    for (const b of blocks) {
      const [, { patterns }] = (b.rules ?? {})[
        "no-restricted-imports"
      ] as Patterns;

      expect(patterns.map((p) => p.regex)).toContain(RELATIVE);
      expect(patterns.every((p) => p.message.length > 0)).toBe(true);
    }
  });
});
