// Fails when a folder under src or tests holds more than 10 files or more than 10 subfolders (Omer's folder-limits, 4e7a65f). Run as part
// of `npm run lint`, so local and CI agree. Folders are counted from `git ls-files`, never readdir: readdir sees .DS_Store and other
// local files that CI does not have. Only files that exist on disk count, so a deleted file that is still staged does not.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const MAX_FILES = 10;
export const MAX_FOLDERS = 10;
export const ROOTS = ["src", "tests"];

const addTo = (map, key, value) =>
  map.set(key, (map.get(key) ?? new Set()).add(value));

/** Per folder under the roots: the files directly in it, and the subfolders directly under it. */
function tally(paths) {
  const files = new Map();
  const folders = new Map();

  for (const path of paths.filter((p) => ROOTS.includes(p.split("/")[0]))) {
    const parts = path.split("/");

    addTo(files, parts.slice(0, -1).join("/"), path);

    for (let i = 1; i < parts.length - 1; i += 1) {
      addTo(folders, parts.slice(0, i).join("/"), parts[i]);
    }
  }

  return { files, folders };
}

const overLimit = (map, max, what, advice) =>
  [...map]
    .filter(([, set]) => set.size > max)
    .map(
      ([dir, set]) => `${dir}: ${set.size} ${what}, at most ${max}. ${advice}`,
    );

/** Every folder in `paths` that is over a limit, as messages that say what to do instead. */
export function folderFindings(paths) {
  const { files, folders } = tally(paths);

  return [
    ...overLimit(
      files,
      MAX_FILES,
      "files",
      "Move a group of related files into a subfolder named for what they do.",
    ),
    ...overLimit(
      folders,
      MAX_FOLDERS,
      "subfolders",
      "Group related subfolders under one folder named for what they share.",
    ),
  ].sort();
}

/** The files git knows about (tracked, or new and not ignored) that exist on disk. */
function listedFiles() {
  return execSync(
    `git ls-files --cached --others --exclude-standard ${ROOTS.join(" ")}`,
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((path) => path !== "" && existsSync(path));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paths = listedFiles();

  if (paths.length === 0) {
    console.error("check-folder-size: scanned 0 files");
    process.exit(1);
  }

  const findings = folderFindings(paths);

  if (findings.length > 0) {
    console.error(`Folders over the limit:\n${findings.join("\n")}`);
    process.exit(1);
  }

  console.log(
    `check-folder-size: ${paths.length} files, no folder over ${MAX_FILES} files or ${MAX_FOLDERS} subfolders`,
  );
}
