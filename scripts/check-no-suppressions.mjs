// Fails when a source file silences a check with a comment. Run as part of `npm run lint`, so local and CI agree.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FORMS = [
  "oxlint-disable",
  "eslint-disable",
  "@ts-ignore",
  "@ts-nocheck",
  "@ts-expect-error",
];
const files = execSync(
  "git ls-files --cached --others --exclude-standard src tests scripts",
  { encoding: "utf8" },
)
  .split("\n")
  .filter(
    (f) =>
      /\.(ts|tsx|js|mjs|cjs)$/.test(f) &&
      f !== "scripts/check-no-suppressions.mjs",
  );

if (files.length === 0) {
  console.error("check-no-suppressions: scanned 0 files");
  process.exit(1);
}

const hits = [];

for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");

  for (const [i, line] of lines.entries()) {
    const form = FORMS.find((f) => line.includes(f));

    if (form) {
      hits.push(`${file}:${i + 1}: ${form}`);
    }
  }
}

if (hits.length > 0) {
  console.error(`Suppression comments are not allowed:\n${hits.join("\n")}`);
  process.exit(1);
}

console.log(`check-no-suppressions: ${files.length} files, none suppressed`);
