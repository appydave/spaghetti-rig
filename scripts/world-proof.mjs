// Do two trees play the same world? Runs lint/gates/world-proof.test.ts on each (twice per tree, in separate processes) and compares the
// logs it writes: a fingerprint of the scene, the state and the sounds after every step and at fixed frames inside it, per scenario.
//   node scripts/world-proof.mjs <old-ref> <new-ref>     any git refs, or WORKTREE for the files on disk here
//   node scripts/world-proof.mjs --selftest [<ref>]      change one look in the new tree's log and prove the comparison fails
// Exit 0: identical (and each tree repeats itself). Exit 1: a difference, named scenario by scenario with the first look that differs.
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..");
const HARNESS = "lint/gates/world-proof.test.ts";
/** Both files go into every tree checked, whatever that tree has, so an older tree can be measured too. */
const HARNESS_FILES = [HARNESS, "lint/gates/world-fingerprint.ts"];
const WORKTREE = "WORKTREE";
const EXIT_DIFFERENT = 1;
const MAX_LISTED = 20;
/** Output of git archive and of a vitest run can be large: allow a gigabyte. */
const BUFFER_BYTES = 1_073_741_824;
const CONFIG = `import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { include: ["${HARNESS}"], environment: "node" } });\n`;

const git = (...args) =>
  execFileSync("git", ["-C", REPO, ...args], { maxBuffer: BUFFER_BYTES });

/** Check a tree out into a scratch directory, with the harness and a vitest config that runs only it. */
function checkout(ref) {
  const dir = mkdtempSync(join(tmpdir(), "world-proof-"));

  if (ref === WORKTREE) {
    const files = git("ls-files", "-co", "--exclude-standard", "-z")
      .toString()
      .split("\0")
      .filter(Boolean);

    for (const f of files) {
      mkdirSync(join(dir, f, ".."), { recursive: true });
      cpSync(join(REPO, f), join(dir, f), { dereference: true });
    }
  } else {
    execFileSync("tar", ["-x", "-C", dir], {
      input: git("archive", ref),
      maxBuffer: BUFFER_BYTES,
    });
  }

  symlinkSync(join(REPO, "node_modules"), join(dir, "node_modules"));
  mkdirSync(join(dir, "lint/gates"), { recursive: true });
  for (const f of HARNESS_FILES) {
    cpSync(join(REPO, f), join(dir, f));
  }

  writeFileSync(join(dir, "vitest.world-proof.config.ts"), CONFIG);

  return dir;
}

/** One separate process: play everything, return the log it wrote (or exit if the harness itself failed). */
function worldLog(dir, label) {
  const out = join(dir, `${label}.json`);
  const run = spawnSync(
    "npx",
    ["vitest", "run", "-c", "vitest.world-proof.config.ts"],
    {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, WORLD_PROOF_OUT: out },
    },
  );

  if (run.status !== 0) {
    console.error(
      `the harness failed on ${label}:\n${run.stdout}\n${run.stderr}`,
    );
    process.exit(EXIT_DIFFERENT);
  }

  return JSON.parse(readFileSync(out, "utf8"));
}

/** The scenarios that differ, each with the first look that does. */
function differences(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => {
      const [x, y] = [a[k] ?? [], b[k] ?? []];
      const at = x.findIndex((look, i) => look !== y[i]);

      return `${k}: first look to differ is ${(x[at] ?? y[at] ?? "missing").split(" ").slice(0, 2).join(" ")}`;
    });
}

function report(title, found) {
  console.log(`${found.length ? "DIFFERENT" : "identical"}: ${title}`);

  for (const k of found.slice(0, MAX_LISTED)) {
    console.log(`  ${k}`);
  }

  if (found.length > MAX_LISTED) {
    console.log(`  ... and ${found.length - MAX_LISTED} more`);
  }
}

function compare(oldRef, newRef, plant) {
  const [oldDir, newDir] = [checkout(oldRef), checkout(newRef)];

  try {
    const [old1, old2] = [worldLog(oldDir, "old-1"), worldLog(oldDir, "old-2")];
    const [new1, new2] = [worldLog(newDir, "new-1"), worldLog(newDir, "new-2")];
    const runs = Object.keys(old1).length;

    const repeats = [differences(old1, old2), differences(new1, new2)];

    report(
      `old repeats itself across two processes (${runs} scenarios)`,
      repeats[0],
    );
    report("new repeats itself across two processes", repeats[1]);

    if (plant) {
      const first = Object.keys(new1)[0];

      new1[first][0] += "x";
    }

    const found = differences(old1, new1);

    report(`old (${oldRef}) vs new (${newRef})`, found);

    return found.length + repeats[0].length + repeats[1].length;
  } finally {
    rmSync(oldDir, { recursive: true, force: true });
    rmSync(newDir, { recursive: true, force: true });
  }
}

const [first, second] = process.argv.slice(2);

if (first === "--selftest") {
  const ref = second ?? WORKTREE;

  console.log(
    "selftest: change one look in the new log, expect the comparison to fail and name it",
  );

  const bad = compare(ref, ref, true);

  console.log(
    bad
      ? `selftest PASSED: the change was caught (${bad} differences)`
      : "selftest FAILED: the change was NOT caught",
  );
  process.exit(bad ? 0 : EXIT_DIFFERENT);
} else if (first && second) {
  process.exit(compare(first, second, false) ? EXIT_DIFFERENT : 0);
} else {
  console.error(
    "usage: node scripts/world-proof.mjs <old-ref> <new-ref> | --selftest [<ref>]",
  );
  process.exit(EXIT_DIFFERENT);
}
