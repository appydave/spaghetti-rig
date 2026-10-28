// The test environment stays node (G04 H2). Two files, the Director harness and its lane edge tests, opt in to a DOM with a `@vitest-environment` header; no other
// test file may, and nothing may switch the default. This test itself runs in the default environment, so it also proves that a probe there
// sees no document: the DOM belongs to the Director harness and cannot leak into the others.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(import.meta.dirname, "../..");
const OPTED_IN = [
  "lint/gates/director-edges.test.ts",
  "lint/gates/director-proof.test.ts",
  "lint/gates/lanes-edges.test.ts",
];
/** A header comment: a line that starts with the comment, not text that merely mentions it. */
const HEADER = /^\s*\/\/\s*@vitest-environment\b/m;
const SKIP = new Set(["node_modules", "dist", ".git", "public", "docs"]);

/** Every test file below a folder, as paths from the repo root. */
function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);

    if (e.isDirectory()) {
      return SKIP.has(e.name) ? [] : testFiles(path);
    }

    return /\.(test|spec)\.ts$/.test(e.name) ? [relative(REPO, path)] : [];
  });
}

describe("test environment", () => {
  it("only the Director harness opts in to a DOM", () => {
    const carrying = testFiles(REPO).filter((f) =>
      HEADER.test(readFileSync(join(REPO, f), "utf8")),
    );

    expect(carrying.sort()).toEqual(OPTED_IN);
  });

  it("the config keeps the default environment as node", () => {
    expect(readFileSync(join(REPO, "vite.config.ts"), "utf8")).toMatch(
      /environment:\s*"node"/,
    );
  });

  it("a probe in the default environment sees no document", () => {
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
  });
});
