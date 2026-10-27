// Proves the root-imports gate (G10, Omer 76afd84) is wired: every way of importing fails when the path is relative, a root import
// passes, and the files that may keep relative imports are exactly the ones named here. The probes run in a sandbox that mirrors the
// repo (the real .oxlintrc.json, node_modules), so changing the config breaks a test.
import { describe, expect, it } from "vitest";
import { ROOT_IMPORTS_CODE, ROOT_IMPORTS_PROBES } from "./root-imports-probes";
import { readConfig } from "./sandbox";
import { describeProbes } from "./support/probe-gate";

/** The files that keep relative imports (R8): they run in Node outside the package, in temp sandboxes where #root is undefined. */
const RELATIVE_ALLOWED = ["lint/**", "scripts/**", "*.config.ts"];

describeProbes("root-imports", ROOT_IMPORTS_PROBES, [ROOT_IMPORTS_CODE]);

describe("root-imports exemption", () => {
  const blocks = readConfig().overrides.filter(
    (o) => o.rules && "no-restricted-imports" in o.rules,
  );

  it("is exactly the files named here, and nothing else turns the rule off", () => {
    expect(blocks.map((o) => o.files)).toEqual([RELATIVE_ALLOWED]);
    expect(blocks[0]?.rules?.["no-restricted-imports"]).toBe("off");
  });
});
