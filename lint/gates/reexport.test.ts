// Proves the no-reexport gate (the F1 ruling, 10-29) is wired: every barrel shape, the import-then-export dodge and `export default` of an import fail, the shapes that are
// not re-exports pass, the config names exactly the files it covers, and `src` itself reads zero findings. The probes run in a sandbox
// that mirrors the repo (the real .oxlintrc.json, the plugin files in lint/gates, node_modules).
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { REEXPORT_CODE, REEXPORT_PROBES } from "./reexport-probes";
import { REPO, lintIn, oxlintIn, readConfig, type Config } from "./sandbox";
import { describeProbes } from "./support/probe-gate";

/** What the lint message tells an agent to do: it is the agent's prompt (rule 8), so its first sentence is pinned. */
const MESSAGE = "Import it from the module that defines it";

const RULE = "exports/no-reexport";

describeProbes("reexport", REEXPORT_PROBES, [REEXPORT_CODE]);

describe("reexport gate wiring", () => {
  const config = readConfig();
  const ruleBlocks = config.overrides.filter(
    (o) => o.rules !== undefined && RULE in o.rules,
  );

  it("covers production src, and only test files in src are let off", () => {
    expect(ruleBlocks.map((o) => [o.files, o.rules?.[RULE]])).toEqual([
      [["src/**"], "error"],
      [["src/**/*.test.ts"], "off"],
    ]);
  });

  it("tells the agent where to import from", () => {
    expect(
      readFileSync(join(REPO, "lint/gates/export-policy.mjs"), "utf8"),
    ).toContain(MESSAGE);
  });

  it("is what turns the bad example into a failure: without the rule block, a barrel passes", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "reexport-wiring-"));
    const path = "src/barrel.ts";
    const without: Config = {
      ...config,
      overrides: config.overrides.filter((o) => !(o.rules && RULE in o.rules)),
    };

    try {
      mkdirSync(dirname(join(sandbox, path)), { recursive: true });
      writeFileSync(join(sandbox, path), 'export { a } from "./a.ts";\n');

      expect(
        lintIn(sandbox, without, [path], [REEXPORT_CODE]).get(path),
      ).toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("finds nothing in the real src: greenfield, no baseline and no exemption", () => {
    const found = oxlintIn(REPO, ["src"]).filter(
      (d) => d.code === REEXPORT_CODE,
    );

    expect(found).toEqual([]);
  });
});
