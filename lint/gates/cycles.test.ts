// Proves the cycles gate (G11, R15: oxlint's import/no-cycle) is wired: a value cycle, a type-only cycle and a three-file cycle fail, and
// imports that run one way pass. The probes run in a sandbox that mirrors the repo (the real .oxlintrc.json, node_modules), so changing
// the config breaks a test. It also pins the setting that acts, ignoreTypes: false, and that no block turns the rule off.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CYCLES_CODE, CYCLES_PROBES } from "./cycles-probes";
import { REPO, readConfig } from "./sandbox";
import { describeProbes } from "./support/probe-gate";

const RULE = "import/no-cycle";

describeProbes("cycles", CYCLES_PROBES, [CYCLES_CODE]);

describe("cycles setting", () => {
  it("counts type-only cycles (ignoreTypes: false), and no block turns the rule off", () => {
    const config: {
      rules: Record<string, [string, { ignoreTypes: boolean }]>;
    } = JSON.parse(
      readFileSync(join(REPO, ".oxlintrc.json"), "utf8").replaceAll(
        /^\s*\/\/.*$/gm,
        "",
      ),
    );

    expect(config.rules[RULE]).toEqual(["error", { ignoreTypes: false }]);
    expect(
      readConfig().overrides.filter((o) => o.rules && RULE in o.rules),
    ).toEqual([]);
  });
});
