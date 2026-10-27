// Proves the duplicate gate (G08) is wired and kept honest. The probes plant a pair of copies in a sandbox that holds the real .jscpd.json:
// the exact profile fails a run of 40 tokens and passes 39, and wants a copy of more than 5 lines; the near-miss profile fails a copy that
// only has other names and passes one with a changed statement; css is read; test files are not. The guards keep the one way out honest:
// the ignore list is exactly the procedural-data file named in exemptions.ts, and that file still has the clone that earns it.
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DUPLICATES_PD } from "./exemptions";
import { PROFILES, REPO, runProfile } from "./duplicates.mjs";
import config from "../../.jscpd.json";
import {
  cleanScratch,
  gapped,
  names,
  pair,
  readers,
  run,
  runCheckScript,
  sandbox,
  statements,
  tiny,
} from "./support/duplicate-probes";

afterAll(cleanScratch);

describe("the exact profile", () => {
  it("fails a copy of 40 tokens", () => {
    expect(run("exact", pair(names(19, 1)))).toBe(1);
  });

  it("passes a copy of 39 tokens", () => {
    expect(run("exact", pair(names(19)))).toBe(0);
  });

  it("fails a copy of more than 5 lines", () => {
    expect(run("exact", pair(statements(4)))).toBe(1);
  });

  it("passes a copy of 5 lines", () => {
    expect(run("exact", pair(statements(3)))).toBe(0);
  });

  it("reads css", () => {
    const rule = (sel: string) =>
      `${sel} {\n${[...Array(8).keys()].map((i) => `  margin-top: ${i}rem;\n`).join("")}}\n`;
    const css = `${rule(".one")}${rule(".two")}`.replaceAll(
      "margin-top",
      "padding",
    );

    expect(
      run("exact", { "src/x.css": css, "src/other.ts": statements(8) }),
    ).toBe(1);
  });

  it("does not read test files", () => {
    const files = Object.fromEntries(
      Object.entries(pair(names(30))).map(([k, v]) => [
        k.replace(".ts", ".test.ts"),
        v,
      ]),
    );

    // One file that is read and has no copy in it, so a run that read nothing cannot pass for a run that found nothing.
    const other = { "src/other.ts": statements(8) };

    expect(run("exact", { ...files, ...other })).toBe(0);
  });
});

describe("the near-miss profile", () => {
  it("fails a copy that only has other names", () => {
    expect(run("similar", readers(4))).toBe(1);
  });

  it("fails a copy with one statement added to thirty (a tree 0.92 alike)", () => {
    expect(run("similar", readers(30, { added: true }))).toBe(1);
  });

  it("passes a copy with one statement of four changed", () => {
    expect(run("similar", readers(4, { other: 1 }))).toBe(0);
  });
});

describe("the near-miss profile, in the shapes only its own flags catch", () => {
  const gappedFiles = {
    "src/a.ts": gapped("const", "A"),
    "src/b.ts": gapped("let", "B"),
  };

  it("fails two short runs joined across a gap of changed lines (--max-gap-lines)", () => {
    expect(run("similar", gappedFiles)).toBe(1);
  });

  it("does not fail those same runs under the exact profile", () => {
    expect(run("exact", gappedFiles)).toBe(0);
  });

  it("fails a pair of functions under 20 tree nodes (min-nodes 1)", () => {
    expect(
      run("similar", { "src/c.ts": `${tiny("one", 1)}\n${tiny("two", 5)}` }),
    ).toBe(1);
  });
});

describe("the script CI runs", () => {
  it("exits 1 and says what to do when there is a clone", () => {
    const run1 = runCheckScript(pair(names(19, 1)));

    expect(run1.status).toBe(1);
    expect(run1.stderr).toContain("Move the repeated code");
  });

  it("exits 0 when there is none", () => {
    expect(runCheckScript({}).status).toBe(0);
  });
});

describe("the ignore list", () => {
  it("is the procedural-data file named in exemptions.ts, and test files", () => {
    expect([...config.ignore].sort()).toEqual(
      ["**/*.test.ts", ...DUPLICATES_PD].sort(),
    );
  });

  it("still has the clone that earns it: scanned alone, without the entry, characters.ts fails", () => {
    const root = sandbox("duplicates-pd-");

    writeFileSync(
      join(root, ".jscpd.json"),
      JSON.stringify({ ...config, ignore: ["**/*.test.ts"] }),
    );
    for (const file of DUPLICATES_PD) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      cpSync(join(REPO, file), join(root, file));
    }

    expect(runProfile("exact", root).code).toBe(1);
  });

  it("reads both profiles from one place", () => {
    expect(Object.keys(PROFILES)).toEqual(["exact", "similar"]);
  });
});
