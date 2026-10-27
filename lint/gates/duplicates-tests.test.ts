// Proves the second duplicate scan (G08b: tests and tooling) is wired and kept honest, the way duplicates.test.ts proves the first. It reads
// src (test files too), tests/, lint/ and scripts/ with only the pinned procedural-data file ignored (the same list as the first scan): exact at 53 tokens and more than 9 lines, near-miss at 0.95 with gaps
// of up to 3 lines. Each probe plants a pair in a sandbox with the real configs; the script probes run the script CI runs.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import config from "../../.jscpd.tests.json";
import { DUPLICATES_PD } from "./exemptions";
import { REPO, TEST_PROFILES } from "./duplicates.mjs";
import {
  cleanScratch,
  gapped,
  names,
  pair,
  readers,
  run,
  runCheckScript,
  statements,
} from "./support/duplicate-probes";

afterAll(cleanScratch);

/** The same planted file in tests/ under a name that is not a test's: jscpd leaves .test.ts and .spec.ts files out of its syntax-tree pass. */
const inTests = (files: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(files).map(([k, v]) => [k.replace(/^src\//, "tests/"), v]),
  );

/** A planted pair as test files: the same files, renamed to end in .test.ts. */
const asTests = (files: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(files).map(([k, v]) => [k.replace(/\.ts$/, ".test.ts"), v]),
  );

describe("the exact scan of tests and tooling", () => {
  it("fails a copy of 53 tokens in test files", () => {
    expect(run("exact", asTests(pair(names(26))), "tests")).toBe(1);
  });

  it("passes a copy of 52 tokens", () => {
    expect(run("exact", asTests(pair(names(25, 1))), "tests")).toBe(0);
  });

  it("fails a copy of more than 9 lines", () => {
    expect(run("exact", asTests(pair(statements(8))), "tests")).toBe(1);
  });

  it("passes a copy of 9 lines", () => {
    expect(run("exact", asTests(pair(statements(7))), "tests")).toBe(0);
  });

  it.each([
    ["tests/", pair(names(26)), "tests/a.ts", "tests/b.ts"],
    ["lint/", pair(names(26)), "lint/a.ts", "lint/b.ts"],
    [
      "scripts/ (a .mjs file)",
      pair(names(26), "mjs"),
      "scripts/a.mjs",
      "scripts/b.mjs",
    ],
  ])("reads %s", (_name, files, first, second) => {
    const [a, b] = Object.values(files);

    expect(run("exact", { [first]: a ?? "", [second]: b ?? "" }, "tests")).toBe(
      1,
    );
  });
});

describe("the near-miss scan of tests and tooling", () => {
  it("fails a copy that only has other names", () => {
    expect(run("similar", inTests(readers(4)), "tests")).toBe(1);
  });

  it("passes a copy with one statement added to thirty (a tree 0.92 alike, under 0.95)", () => {
    expect(run("similar", inTests(readers(30, { added: true })), "tests")).toBe(
      0,
    );
  });

  it("fails two short runs joined across a gap of 4 changed lines (the limit is 3: the lines either side count)", () => {
    const files = {
      "src/a.test.ts": gapped("const", "A", 4),
      "src/b.test.ts": gapped("let", "B", 4),
    };

    expect(run("similar", files, "tests")).toBe(1);
  });

  it("passes the same runs across a gap of 5", () => {
    const files = {
      "src/a.test.ts": gapped("const", "A", 5),
      "src/b.test.ts": gapped("let", "B", 5),
    };

    expect(run("similar", files, "tests")).toBe(0);
  });
});

describe("the script CI runs, on tests", () => {
  it("exits 1 and says to move it into a shared test helper when a test file has a copy", () => {
    const result = runCheckScript(asTests(pair(names(26))));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("one shared test helper");
  });

  it("honours the pinned procedural-data list: one more repeat of characters.ts's own lines passes both scans", () => {
    const [file] = DUPLICATES_PD;
    const lines = readFileSync(join(REPO, file ?? ""), "utf8").split("\n");
    // Lines 188 to 199 are a 12-line run of hand-placed parts; repeating them in a new function is a clone inside the file.
    const repeat = lines.slice(187, 199).join("\n");
    const result = runCheckScript({
      [file ?? ""]: `${lines.join("\n")}\nfunction again() {\n${repeat}\n}\n`,
    });

    expect(result.status).toBe(0);
  });

  it("exits 0 when there is none", () => {
    expect(runCheckScript({}).status).toBe(0);
  });
});

describe("the config", () => {
  it("ignores exactly the procedural-data file named in exemptions.ts, and reads these four folders", () => {
    expect(config.ignore).toEqual(DUPLICATES_PD);
    expect(config.path).toEqual(["src", "tests", "lint", "scripts"]);
  });

  it("holds Omer's exact setting and the calibrated near-miss one", () => {
    expect(TEST_PROFILES.exact.join(" ")).toContain(
      "--min-tokens 53 --min-lines 9",
    );
    expect(TEST_PROFILES.similar.join(" ")).toContain("--similarity 0.95");
    expect(TEST_PROFILES.similar.join(" ")).toContain("--max-gap-lines 3");
  });
});
