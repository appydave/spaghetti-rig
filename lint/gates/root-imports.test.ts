// Proves the root-imports gate (G10, Omer 76afd84) is wired: every way of importing fails when the path is relative, a root import
// passes, and the files that may keep relative imports are exactly the ones named here. The probes run in a sandbox that mirrors the
// repo (the real .oxlintrc.json, node_modules), so changing the config breaks a test.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT_IMPORTS_CODE, ROOT_IMPORTS_PROBES } from "./root-imports-probes";
import { REPO, readConfig } from "./sandbox";
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

describe("root-imports exemption", () => {
  // The G12 layer blocks set the rule too, with G10's pattern kept (boundaries.test.ts pins that); only a block that turns it off is an exemption.
  const blocks = readConfig().overrides.filter(
    (o) => o.rules?.["no-restricted-imports"] === "off",
  );

  it("is exactly the files named here, and nothing else turns the rule off", () => {
    expect(blocks.map((o) => o.files)).toEqual([RELATIVE_ALLOWED]);
    expect(blocks[0]?.rules?.["no-restricted-imports"]).toBe("off");
  });

  it("tells the agent what to write instead", () => {
    expect(ruleMessage()).toContain(MESSAGE_FRAGMENT);
  });
});
