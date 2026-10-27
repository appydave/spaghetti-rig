// What the size and complexity gate tests share: plant each probe's file in a sandbox, lint the files with the repo's config, and check
// that every probe is found by exactly the rules it names. One home, so the two gates are proved the same way.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lintIn, readConfig } from "../sandbox";

/** Where a probe names the rule codes it must trigger. */
const CODES = 3;

/** A probe: its name, the file it plants, that file's source, and the rule codes it must trigger (none: it must pass). */
export type Probe = readonly [string, string, string, readonly string[]];

/** Register the gate's probe tests: each probe is linted in one sandbox and must trigger exactly the codes it names, and every code needs a probe that fails and one that passes. */
export function describeProbes(
  kind: string,
  probes: readonly Probe[],
  codes: readonly string[],
) {
  let found = new Map<string, string[]>();
  let sandbox = "";

  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), `${kind}-sandbox-`));

    for (const [, path, source] of probes) {
      mkdirSync(dirname(join(sandbox, path)), { recursive: true });
      writeFileSync(join(sandbox, path), source);
    }

    found = lintIn(
      sandbox,
      readConfig(),
      probes.map((p) => p[1]),
      codes,
    );
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe(`${kind} gate`, () => {
    it.each(probes.map((p) => [p[0], p[1], p[CODES]] as const))(
      "%s",
      (_name, path, expected) => {
        expect([...(found.get(path) ?? [])].sort()).toEqual(
          [...expected].sort(),
        );
      },
    );

    it(`every ${kind} rule has a probe that fails and one that passes`, () => {
      const failing = new Set(probes.flatMap((p) => p[CODES]));

      expect(codes.filter((c) => !failing.has(c))).toEqual([]);
      expect(
        probes.filter((p) => p[CODES].length === 0).length,
      ).toBeGreaterThan(0);
    });
  });
}
