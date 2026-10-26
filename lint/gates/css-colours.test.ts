// Proves the CSS colour check (css-colours.mjs): every colour form outside :root fails, its var() twin passes, and an empty scan fails.
// The check runs as the command line runs it, on a temporary folder, so its exit codes are what CI sees.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCRIPT = resolve(import.meta.dirname, "css-colours.mjs");
// Built from pieces so this file passes the colour rules it tests.
const hex = (digits: string): string => `#${digits}`;
const call = (name: string, args: string): string => `${name}(${args})`;
const NAMED = ["re", "d"].join("");
const rule = (body: string): string => `.a {\n  ${body};\n}\n`;

const FAILS: readonly [string, string][] = [
  ["six-digit hex", rule(`color: ${hex("ff0000")}`)],
  ["three-digit hex", rule(`color: ${hex("f00")}`)],
  ["eight-digit hex", rule(`color: ${hex("ff000080")}`)],
  ["an rgb function", rule(`color: ${call("rgb", "255, 0, 0")}`)],
  ["an rgba function", rule(`color: ${call("rgba", "255, 0, 0, 0.5")}`)],
  ["an hsl function", rule(`color: ${call("hsl", "0 100% 50%")}`)],
  ["an hsla function", rule(`color: ${call("hsla", "0 100% 50% / 0.5")}`)],
  ["a named colour", rule(`color: ${NAMED}`)],
  ["transparent", rule("background: transparent")],
  [
    "a colour inside a gradient",
    rule(`background: linear-gradient(${hex("fff")}, var(--x))`),
  ],
  ["a colour in a shadow", rule(`box-shadow: 0 0 0 1px ${hex("000")}`)],
  [
    "a colour inside @media",
    `@media (min-width: 1px) {\n  .a {\n    color: ${hex("fff")};\n  }\n}\n`,
  ],
  [
    "a colour in a custom property outside :root",
    rule(`--tint: ${hex("fff")}`),
  ],
  [
    "a colour in the last declaration, no semicolon",
    `.a {\n  color: ${hex("fff")}\n}\n`,
  ],
];

const PASSES: readonly [string, string][] = [
  ["var() instead of the colour", rule("color: var(--ink)")],
  [
    "a colour inside :root",
    `:root {\n  --ink: ${hex("173e35")};\n  --veil: ${call("rgba", "0, 0, 0, 0.5")};\n  --none: transparent;\n}\n`,
  ],
  ["currentColor", rule("border-color: currentColor")],
  ["a colour name inside a custom property name", rule("color: var(--yellow)")],
  ["a colour word in a property name", rule("white-space: nowrap")],
  [
    "a colour word in a selector",
    `.${NAMED}-button:hover {\n  cursor: pointer;\n}\n`,
  ],
  [
    "a colour in a comment inside a rule",
    rule(`color: var(--ink) /* ${hex("fff")} */`),
  ],
  [
    "a colour inside an unquoted url()",
    rule(`--ico: url(data:image/svg+xml,stroke=${NAMED}&fill=${hex("fff")})`),
  ],
  ["a colour word inside a string", rule(`content: "${NAMED}"`)],
  [
    "a custom property declared after a nested block inside :root",
    `:root {\n  .nested {\n    margin: 0;\n  }\n  --ink: ${hex("ff0000")};\n}\n`,
  ],
];

let dir = "";
let next = 0;

function check(css: string | null) {
  const target = join(dir, `case-${next++}`);

  spawnSync("mkdir", [target]);

  if (css !== null) {
    writeFileSync(join(target, "probe.css"), css);
  }

  return spawnSync("node", [SCRIPT, target], { encoding: "utf8" });
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "css-colours-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("css-colours", () => {
  it.each(FAILS)("fails on %s", (_name, css) => {
    const run = check(css);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("custom property");
  });

  it.each(PASSES)("passes on %s", (_name, css) => {
    const run = check(css);

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });

  it("names the line of the colour", () => {
    const run = check(
      `.a {\n  margin: 0;\n}\n\n.b {\n  color: ${hex("fff")};\n}\n`,
    );

    expect(run.stderr).toContain("probe.css:6:");
  });

  it("fails when it scanned no CSS file, so a moved stylesheet cannot make it pass", () => {
    expect(check(null).status).toBe(1);
  });
});
