// Proves the root-imports gate (G10, Omer 76afd84) is wired: every way of importing fails when the path is relative, a root import
// passes, and the files that may keep relative imports are exactly the ones named here. The probes run in a sandbox that mirrors the
// repo (the real .oxlintrc.json, node_modules), so changing the config breaks a test.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT_IMPORTS_CODE, ROOT_IMPORTS_PROBES } from "./root-imports-probes";
import { REPO, readConfig, type Override } from "./sandbox";
import { describeProbes } from "./support/probe-gate";

/** The files that keep relative imports (R8): they run in Node outside the package, in temp sandboxes where #root is undefined. */
const RELATIVE_ALLOWED = ["lint/**", "scripts/**"];

/** What the lint message tells an agent to write: it is the agent's prompt (rule 8), so a fragment of it is pinned. */
const MESSAGE_FRAGMENT = "#root/src/";

/** The message the rule carries in the repo's config. */
function ruleMessage(): string {
  const config: {
    rules: Record<string, [string, { patterns: { message: string }[] }]>;
  } = JSON.parse(
    readFileSync(join(REPO, ".oxlintrc.json"), "utf8").replaceAll(
      /^\s*\/\/.*$/gm,
      "",
    ),
  );

  return config.rules["no-restricted-imports"]?.[1].patterns[0]?.message ?? "";
}

describeProbes("root-imports", ROOT_IMPORTS_PROBES, [ROOT_IMPORTS_CODE]);

/** A rule setting as a lint config may spell it: a severity name or number, bare or first in an array. */
type Setting = string | number | readonly (string | number | object)[];

/** A rule setting below error: off or warn, by name or number, bare or as the first entry of an array. */
const SOFTENED = new Set<string | number | object | undefined>([
  "off",
  0,
  "warn",
  1,
]);
const softens = (setting: Setting | undefined): boolean =>
  SOFTENED.has(Array.isArray(setting) ? setting[0] : setting);

/**
 * The blocks that exempt files from G10: any that sets the rule below error (off, or warn, so severity can't be softened unlisted).
 * The G12 layer blocks set it to error with G10's pattern kept (boundaries.test.ts pins that), so they are not exemptions.
 */
const exemptions = (overrides: readonly Override[]): Override[] =>
  overrides.filter(
    (o) =>
      o.rules !== undefined &&
      "no-restricted-imports" in o.rules &&
      softens(o.rules["no-restricted-imports"]),
  );

describe("root-imports exemption", () => {
  const overrides = readConfig().overrides;
  const blocks = exemptions(overrides);

  it("is exactly the files named here, and nothing else turns the rule off or down to warn", () => {
    expect(blocks.map((o) => o.files)).toEqual([RELATIVE_ALLOWED]);
    expect(blocks[0]?.rules?.["no-restricted-imports"]).toBe("off");
  });

  it("tells the agent what to write instead", () => {
    expect(ruleMessage()).toContain(MESSAGE_FRAGMENT);
  });

  // Probes: a planted block that softens the rule to warn, by any spelling, is found as an exemption, so the test above would fail on it;
  // a block that keeps the rule at error (as G12's do) is not.
  const planted = (setting: Setting): Override =>
    ({
      files: ["src/probe/**"],
      rules: { "no-restricted-imports": setting },
    }) as Override;

  it.each(["warn", 1, ["warn", { patterns: [] }], [1], "off", 0, ["off"]])(
    "a planted block setting the rule to %j is an exemption",
    (setting) => {
      expect(
        exemptions([...overrides, planted(setting)]).map((o) => o.files),
      ).toEqual([RELATIVE_ALLOWED, ["src/probe/**"]]);
    },
  );

  it.each(["error", 2, ["error", { patterns: [] }], [2]])(
    "a planted block keeping the rule at %j is not an exemption",
    (setting) => {
      expect(
        exemptions([...overrides, planted(setting)]).map((o) => o.files),
      ).toEqual([RELATIVE_ALLOWED]);
    },
  );

  it("main's G12 layer blocks set the rule and none of them is an exemption", () => {
    const setting = overrides.filter(
      (o) => o.rules !== undefined && "no-restricted-imports" in o.rules,
    );

    expect(setting.length).toBeGreaterThan(blocks.length);
  });
});
