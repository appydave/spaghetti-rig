// Do two trees build the same models? Runs lint/gates/model-proof.test.ts on each (twice per tree, in separate processes) and compares
// what it fingerprints: every model's vertices, materials, lights and transforms, at fixed animation times and over a 50-seed sweep.
//   node scripts/model-proof.mjs <old-ref> <new-ref>     any git refs, or WORKTREE for the files on disk here
//   node scripts/model-proof.mjs --selftest [<ref>]      plant a +0.01 in one model and prove the comparison fails and names it
// Exit 0: identical (and each tree repeats itself). Exit 1: a difference, named model by model.
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
const HARNESS = "lint/gates/model-proof.test.ts";
/** Both files go into every tree checked, whatever that tree has, so an older tree can be measured too. */
const HARNESS_FILES = [HARNESS, "lint/gates/model-fingerprint.ts"];
const WORKTREE = "WORKTREE";
const EXIT_DIFFERENT = 1;
const MAX_LISTED = 20;
/** Output of git archive and of a vitest run can be large: allow a gigabyte. */
const BUFFER_BYTES = 1_073_741_824;
const SELFTEST_MODEL = "character p2 idle";
const CONFIG = `import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { include: ["${HARNESS}"], environment: "node" } });\n`;

const git = (...args) =>
  execFileSync("git", ["-C", REPO, ...args], { maxBuffer: BUFFER_BYTES });

/** Check a tree out into a scratch directory, with the harness and a vitest config that runs only it. */
function checkout(ref) {
  const dir = mkdtempSync(join(tmpdir(), "model-proof-"));

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

  writeFileSync(join(dir, "vitest.model-proof.config.ts"), CONFIG);

  return dir;
}

/** One separate process: build and fingerprint everything, return what it wrote (or exit if the harness itself failed). */
function fingerprints(dir, label, env) {
  const out = join(dir, `${label}.json`);
  const run = spawnSync(
    "npx",
    ["vitest", "run", "-c", "vitest.model-proof.config.ts"],
    {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, ...env, MODEL_PROOF_OUT: out },
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

const keysOf = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])];

/** Model names (with sample time or seed) whose fingerprint differs, with the first node that differs. */
function differences(a, b) {
  const found = [];

  for (const stream of keysOf(a, b)) {
    for (const model of keysOf(a[stream] ?? {}, b[stream] ?? {})) {
      const [x, y] = [a[stream]?.[model], b[stream]?.[model]];

      if (x?.hash !== y?.hash) {
        const node =
          x && y
            ? x.parts.find(
                (p, i) =>
                  p.hash !== y.parts[i]?.hash || p.path !== y.parts[i]?.path,
              )
            : undefined;

        found.push({
          stream,
          model,
          node: node?.path ?? (x ? "missing in new" : "missing in old"),
        });
      }
    }
  }

  return found;
}

function report(title, found) {
  console.log(`${found.length ? "DIFFERENT" : "identical"}: ${title}`);

  for (const d of found.slice(0, MAX_LISTED)) {
    console.log(
      `  ${d.model}  [Math.random: ${d.stream}]  first node: ${d.node}`,
    );
  }

  if (found.length > MAX_LISTED) {
    console.log(`  ... and ${found.length - MAX_LISTED} more`);
  }
}

function compare(oldRef, newRef, env = {}) {
  const [oldDir, newDir] = [checkout(oldRef), checkout(newRef)];

  try {
    const [old1, old2] = [
      fingerprints(oldDir, "old-1"),
      fingerprints(oldDir, "old-2"),
    ];
    const [new1, new2] = [
      fingerprints(newDir, "new-1", env),
      fingerprints(newDir, "new-2", env),
    ];
    const counts = Object.values(old1)
      .map((s) => Object.keys(s).length)
      .join(" + ");
    const repeats = [differences(old1, old2), differences(new1, new2)];

    report(
      `old repeats itself across two processes (${counts} fingerprints per Math.random stream)`,
      repeats[0],
    );
    report("new repeats itself across two processes", repeats[1]);

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
    `selftest: plant +0.01 in "${SELFTEST_MODEL}" on the new tree only, expect the comparison to fail and name it`,
  );

  const bad = compare(ref, ref, { MODEL_PROOF_PLANT: SELFTEST_MODEL });

  console.log(
    bad
      ? `selftest PASSED: the plant was caught (${bad} differences)`
      : "selftest FAILED: the plant was NOT caught",
  );
  process.exit(bad ? 0 : EXIT_DIFFERENT);
} else if (first && second) {
  process.exit(compare(first, second) ? EXIT_DIFFERENT : 0);
} else {
  console.error(
    "usage: node scripts/model-proof.mjs <old-ref> <new-ref> | --selftest [<ref>]",
  );
  process.exit(EXIT_DIFFERENT);
}
