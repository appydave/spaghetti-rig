import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ASSET_DATA } from "./exemptions";
import { assetDataFiles, auditNames, readFile } from "./name-audit.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const scratch: string[] = [];

/** A throwaway checkout: the files given, under src/, and an exemptions.ts naming the asset files. */
function checkout(files: Record<string, string>, assets: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "name-audit-"));

  scratch.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "lint/gates"), { recursive: true });
  writeFileSync(
    join(root, "lint/gates/exemptions.ts"),
    `export const ASSET_DATA = [${assets.map((a) => JSON.stringify(a)).join(", ")}];\n`,
  );
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, "src", name)), { recursive: true });
    writeFileSync(join(root, "src", name), text);
  }

  return root;
}

const audit = (files: Record<string, string>, assets: string[] = []) =>
  auditNames(checkout(files, assets), assets);
const names = (list: { name: string }[]) => list.map((d) => d.name).sort();

afterAll(() => {
  for (const dir of scratch) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("positional names", () => {
  it("flags a letter or digit suffix, in the middle of a name too, and not a word or a longer token", () => {
    const r = audit({
      "a.ts":
        "export const SHOT_A = 1;\nexport const TONE_2 = 2;\nexport const GAP_B_X = 3;\nexport const TAIL_AB = 4;\nexport const SHOT_DELAY = 5;\nexport const V10 = 6;\nexport const HZ_F = 7;\nexport const HZ_G = 8;\n",
    });

    expect(names(r.positional)).toEqual([
      "GAP_B_X",
      "HZ_F",
      "SHOT_A",
      "TONE_2",
    ]);
  });
});

describe("names that echo their value", () => {
  it("flags a number word and a digit token that equals the value, not a digit token that does not", () => {
    const r = audit({
      "a.ts":
        "export const FORTY = 40;\nexport const HALF_SPAN = 7;\nexport const LEN_120 = 120;\nexport const LEN_121 = 120;\nexport const SPAN = 3;\n",
    });

    expect(names(r.echoes)).toEqual(["FORTY", "HALF_SPAN", "LEN_120"]);
  });
});

describe("one name in more than one file", () => {
  it("lists a name defined in two files with where, and not a name used in two files but defined once", () => {
    const r = audit({
      "a.ts": "export const SHARED = 1;\nexport const ONCE = 2;\n",
      "b.ts": "const SHARED = 1;\nconsole.log(ONCE);\n",
    });

    expect(r.duplicates.map((d) => d.name)).toEqual(["SHARED"]);
    expect(r.duplicates[0]?.files).toHaveLength(2);
  });
});

describe("constants equal to 0.5", () => {
  it("finds 0.5 however it is written, and not another value", () => {
    const r = audit({
      "a.ts":
        "const A_HALF = 0.5;\nconst B_HALF = 1 / 2;\nconst C_HALF = .5;\nconst D_HALF = 0.25 * 2;\nconst NOT_HALF = 0.25;\nconst E = 5;\n",
    });

    expect(names(r.halves)).toEqual(["A_HALF", "B_HALF", "C_HALF", "D_HALF"]);
  });

  it("follows a same-file constant", () => {
    const r = audit({ "a.ts": "const BASE = 1;\nconst MIDDLE = BASE / 2;\n" });

    expect(names(r.halves)).toEqual(["MIDDLE"]);
  });
});

describe("single-use constants", () => {
  it("counts a constant used once, and not one used twice or one that is exported and used elsewhere", () => {
    const r = audit({
      "a.ts":
        "const ONCE = 1;\nconst TWICE = 2;\nexport const SHARED = 3;\nconsole.log(ONCE, TWICE, TWICE);\n",
      "b.ts": 'import { SHARED } from "./a";\nconsole.log(SHARED, SHARED);\n',
    });

    expect(r.singleUse).toEqual({ "src/a.ts": 1 });
    expect(r.singleUseTotal).toBe(1);
  });

  it("counts an exported constant used once in another file, and not a same-named name used in another file", () => {
    const r = audit({
      "a.ts":
        "export const SHARED = 3;\nconst LOCAL = 4;\nconsole.log(LOCAL);\n",
      "b.ts": 'import { SHARED } from "./a";\nconsole.log(SHARED, LOCAL);\n',
    });

    // SHARED has one use (in b.ts) and LOCAL one (in a.ts): both are single-use; b.ts's LOCAL is some other LOCAL.
    expect(r.singleUse).toEqual({ "src/a.ts": 2 });
  });

  it("does not count an import or an export specifier as a use", () => {
    const { decls, uses } = readFile(
      "const X_VALUE = 1;\nexport { X_VALUE };\n",
      "a.ts",
    );

    expect(decls).toHaveLength(1);
    expect(uses.get("X_VALUE") ?? 0).toBe(0);
  });
});

describe("the asset-data files", () => {
  it("are not audited, but their uses of a constant count as references", () => {
    const r = audit(
      {
        "a.ts": "export const KNOB = 1;\n",
        "model.ts":
          'import { KNOB } from "./a";\nconst MODEL_NUMBER = 7;\nconsole.log(KNOB, KNOB);\n',
      },
      ["src/model.ts"],
    );

    expect(r.constants).toBe(1);
    expect(r.singleUseTotal).toBe(0);
  });

  it("are read whole from exemptions.ts, the one home of the list", () => {
    expect(assetDataFiles(REPO)).toEqual(ASSET_DATA);
  });
});

describe("an audit that read nothing", () => {
  it("fails the command, so an empty read is never taken for a clean one", () => {
    const root = checkout({});
    const run = spawnSync(
      process.execPath,
      [join(REPO, "lint/gates/name-audit.mjs"), "--root", root],
      { encoding: "utf8" },
    );

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("read no constants");
  });

  it("runs on the real game and reads its constants", () => {
    const real = auditNames(REPO);

    expect(real.constants).toBeGreaterThan(500);
    expect(real.singleUseTotal).toBeGreaterThan(0);
  });
});
