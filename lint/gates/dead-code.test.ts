// Proves the dead-code gate (G11, Knip) is wired: in a sandbox holding the repo's real knip.json, a planted dead export and a planted
// orphan file are reported in normal mode, and a source file that only a test imports is reported in production mode (R10: production
// over src, from index.html to src/main.ts; normal over everything). A used export and the app's own entry pass in both.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REPO } from "./sandbox";

const KNIP = join(REPO, "node_modules/.bin/knip");
/** Knip on a cold sandbox can take a few seconds. */
const KNIP_TIMEOUT_MS = 60_000;

/** The planted project: the app's entry and what it uses, a dead export, an orphan file, and a file only a test reaches. */
const PLANTED = {
  "package.json": JSON.stringify({
    name: "dead-code-probe",
    private: true,
    type: "module",
    imports: { "#root/*": "./*" },
    devDependencies: { vite: "*", vitest: "*" },
  }),
  "index.html":
    '<!doctype html><script type="module" src="/src/main.ts"></script>\n',
  "src/main.ts":
    'import { used } from "#root/src/used.ts";\n\nconsole.log(used);\n',
  "src/used.ts": "export const used = 1;\nexport const dead = 2;\n",
  "src/orphan.ts": "export const orphan = 3;\n",
  "src/only-tests.ts": "export const forTests = 4;\n",
  "src/only-tests.test.ts":
    'import { expect, it } from "vitest";\nimport { forTests } from "#root/src/only-tests.ts";\n\nit("reads it", () => expect(forTests).toBe(4));\n',
};

type Report = {
  issues: { file: string; exports: { name: string }[]; files: unknown[] }[];
};

let sandbox = "";

/** Run knip in the sandbox with these arguments and read its JSON report. */
function knip(...args: string[]): Report {
  const run = spawnSync(
    KNIP,
    ["--no-progress", "--reporter", "json", ...args],
    {
      cwd: sandbox,
      encoding: "utf8",
    },
  );

  return JSON.parse(run.stdout);
}

const unusedFiles = (r: Report) =>
  r.issues
    .filter((i) => i.files.length > 0)
    .map((i) => i.file)
    .sort();
const unusedExports = (r: Report) =>
  r.issues.flatMap((i) => i.exports.map((e) => `${i.file}:${e.name}`));

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "dead-code-sandbox-"));
  cpSync(join(REPO, "knip.json"), join(sandbox, "knip.json"));
  symlinkSync(join(REPO, "node_modules"), join(sandbox, "node_modules"));
  for (const [path, source] of Object.entries(PLANTED)) {
    mkdirSync(dirname(join(sandbox, path)), { recursive: true });
    writeFileSync(join(sandbox, path), source);
  }
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("dead-code gate", () => {
  it(
    "normal mode reports the dead export and the orphan file, and nothing the app or a test uses",
    () => {
      const r = knip();

      expect(unusedExports(r)).toEqual(["src/used.ts:dead"]);
      expect(unusedFiles(r)).toEqual(["src/orphan.ts"]);
    },
    KNIP_TIMEOUT_MS,
  );

  it(
    "production mode also reports a source file that only a test imports",
    () => {
      const r = knip("--production", "--files", "--dependencies");

      expect(unusedFiles(r)).toEqual(["src/only-tests.ts", "src/orphan.ts"]);
    },
    KNIP_TIMEOUT_MS,
  );
});
