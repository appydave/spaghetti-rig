// Proves the folder-size gate (G09, Omer 4e7a65f) is wired: a folder fails just over either limit and passes exactly on it, both roots
// are scanned, only direct children count, the message says what to do, and `npm run lint` runs the check. The probes run the real script
// in a scratch git repo, so a changed limit, a readdir count, an unscanned root or a dropped subfolder count breaks a test.
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  folderFindings,
  MAX_FILES,
  MAX_FOLDERS,
  ROOTS,
} from "../../scripts/check-folder-size.mjs";
import { REPO } from "./sandbox";

/** Named here, not read from the script, so a root dropped from the script fails the probes. */
const SCANNED = ["src", "tests"];
const SCRIPT = join(REPO, "scripts/check-folder-size.mjs");
const sandboxes: string[] = [];

const names = (count: number, make: (i: number) => string): string[] =>
  Array.from({ length: count }, (_, i) => make(i));
const files = (dir: string, count: number): string[] =>
  names(count, (i) => `${dir}/f${i}.ts`);
const folders = (dir: string, count: number): string[] =>
  names(count, (i) => `${dir}/d${i}/f.ts`);

/** Plant these empty files in a scratch git repo (nothing committed) and run the script there. */
function run(paths: readonly string[], gitignore = "") {
  const dir = mkdtempSync(join(tmpdir(), "folder-size-"));

  sandboxes.push(dir);
  spawnSync("git", ["init", "-q"], { cwd: dir });
  writeFileSync(join(dir, ".gitignore"), gitignore);

  for (const path of paths) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), "");
  }

  const result = spawnSync("node", [SCRIPT], { cwd: dir, encoding: "utf8" });

  return { code: result.status, output: result.stderr + result.stdout };
}

afterAll(() => {
  for (const dir of sandboxes) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("folder-size limits", () => {
  it("are 10 files and 10 subfolders, under src and tests", () => {
    expect([MAX_FILES, MAX_FOLDERS, ...ROOTS]).toEqual([
      10,
      10,
      "src",
      "tests",
    ]);
  });

  const KINDS = [
    ["files", MAX_FILES, files],
    ["subfolders", MAX_FOLDERS, folders],
  ] as const;

  it.each(SCANNED.flatMap((root) => KINDS.map((k) => [root, ...k] as const)))(
    "fails a %s folder with 11 %s and passes one with 10",
    (root, what, max, plant) => {
      const over = run(plant(`${root}/a`, max + 1));

      expect(over.code).toBe(1);
      expect(over.output).toContain(`${root}/a: 11 ${what}`);
      expect(run(plant(`${root}/a`, max)).code).toBe(0);
    },
  );

  it("counts a folder's direct children only: deep files do not add up", () => {
    const deep = names(MAX_FILES + 1, (i) => `src/a/b${i % 2}/f${i}.ts`);

    expect(folderFindings(deep)).toEqual([]);
  });

  it("counts the folder on its own: 10 files and 10 subfolders together pass", () => {
    const both = [
      ...files("src/a", MAX_FILES),
      ...folders("src/a", MAX_FOLDERS),
    ];

    expect(folderFindings(both)).toEqual([]);
  });

  it("does not scan folders outside src and tests", () => {
    expect(folderFindings(files("lint/x", 30))).toEqual([]);
  });

  it("counts files git lists, not what readdir finds", () => {
    const listed = [...files("src/a", MAX_FILES), "src/a/x.log"];

    expect(run(listed, "*.log\n").code).toBe(0);
  });

  it("says what to do instead, so the next agent reads it as its prompt", () => {
    const [filesMessage] = folderFindings(files("src/a", MAX_FILES + 1));
    const [foldersMessage] = folderFindings(folders("src/a", MAX_FOLDERS + 1));

    expect(filesMessage).toContain(
      "Move a group of related files into a subfolder",
    );
    expect(foldersMessage).toContain(
      "Group related subfolders under one folder",
    );
  });

  it("fails when it scans nothing, so an empty listing is not a pass", () => {
    expect(run([]).code).toBe(1);
  });

  it("runs as part of npm run lint", () => {
    const scripts: { lint: string } = JSON.parse(
      readFileSync(join(REPO, "package.json"), "utf8"),
    ).scripts;

    expect(scripts.lint).toContain("node scripts/check-folder-size.mjs");
  });

  it("holds for this repository", () => {
    const result = spawnSync("node", [SCRIPT], { cwd: REPO, encoding: "utf8" });

    expect(result.status, result.stderr).toBe(0);
  });
});
