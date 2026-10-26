import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  collectRules,
  collectScreen,
  type ScreenColours,
} from "./colour-collectors";
import { boot } from "./helpers";

// Proves a stylesheet change did not change a single colour, on every screen of the show. The result is committed as
// tests/__snapshots__/colour-rules.txt and colour-screens.txt; an intended colour change shows as a diff of that file (`npx playwright test
// computed-colours --update-snapshots` rewrites it). Two things are written down, both as the browser computes them (so #hex, rgba()
// and var() compare as one value):
//   rules    every colour a style rule or keyframe declares, resolved on a probe element, even for states never shown
//   screens  per screen, a hash of every element's computed colours, and how many elements have each colour (ids in the legend)

const COLOUR_PROPERTIES = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "box-shadow",
  "text-shadow",
  "fill",
  "stroke",
  "filter",
  "text-decoration-color",
  "caret-color",
];
const MODE_KEYS = ["b", "1", "2"];
const AFTER_KEYS = ["p", "p", "n", "n", "h", "Escape"];
const SETTLE_MS = 250;
// A full walk of all three modes takes minutes, not the seconds of an ordinary test.
const WALK_TIMEOUT_MS = 900_000;
// Animations and transitions are frozen while the screens are read: an element caught mid-flash has a colour that depends on timing, not
// on the stylesheet. What the animations themselves colour is covered by `rules`, which resolves every keyframe directly.
const FREEZE =
  "*, *::before, *::after { animation: none !important; transition: none !important; }";
/** Hex digits of a colour string's id in the legend. */
const ID_LENGTH = 8;

const idOf = (colours: string) =>
  createHash("sha1").update(colours).digest("hex").slice(0, ID_LENGTH);

async function ready(page: Page) {
  await boot(page);
  await page.addStyleTag({ content: FREEZE });
}

/** Walk every screen of the show, in the order the old script did, and read each one. */
async function readScreens(page: Page) {
  const screens = new Map<string, ScreenColours>();
  const grab = async (name: string) => {
    await page.waitForTimeout(SETTLE_MS);
    screens.set(name, await page.evaluate(collectScreen, COLOUR_PROPERTIES));
  };

  await grab("title");

  const rules = await page.evaluate(collectRules, COLOUR_PROPERTIES);

  for (const mode of MODE_KEYS) {
    await page.keyboard.press(mode);
    await page.keyboard.press("Enter");
    await grab(`menu-${mode}`);
    await page.evaluate("window.__rig.start(0)");

    const steps = await page.evaluate("window.__rig.director.script.length");

    for (let i = 0; i < Number(steps); i++) {
      await page.evaluate(`window.__rig.director.go(${i}, true)`);
      await grab(`mode-${mode}-step-${i}`);
    }

    for (const key of AFTER_KEYS) {
      await page.keyboard.press(key);
      await grab(`mode-${mode}-key-${key}-${screens.size}`);
    }

    await page.reload();
    await ready(page);
  }

  await page.goto("/?presenter");
  await page.addStyleTag({ content: FREEZE });
  await grab("presenter");

  return { rules, screens };
}

/** The rules as text, one line each. */
const describeRules = (rules: Record<string, string>) =>
  `${Object.entries(rules)
    .map(([key, value]) => `${key} = ${value}`)
    .join("\n")}\n`;

/** The screens as text: one line per screen, then the legend of colour ids. */
function describeScreens(screens: Map<string, ScreenColours>) {
  const legend = new Map<string, string>();
  const screenLines = [...screens].map(([name, { hash, counts }]) => {
    const ids = Object.entries(counts).map(([colours, n]) => {
      legend.set(idOf(colours), colours);

      return `${idOf(colours)}x${n}`;
    });

    return `screen ${name} ${hash}: ${ids.sort((a, b) => a.localeCompare(b)).join(" ")}`;
  });
  const legendLines = [...legend]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, colours]) => `colour ${id} = ${colours}`);

  return `${[...screenLines, ...legendLines].join("\n")}\n`;
}

test("every declared colour and every screen's computed colours are as committed", async ({
  page,
}) => {
  test.setTimeout(WALK_TIMEOUT_MS);
  await ready(page);

  const { rules, screens } = await readScreens(page);

  expect(Object.keys(rules).length).toBeGreaterThan(0);
  expect(screens.size).toBeGreaterThan(0);
  // Soft, so a change that moves both a rule and a screen reports both diffs.
  expect.soft(describeRules(rules)).toMatchSnapshot("colour-rules.txt");
  expect.soft(describeScreens(screens)).toMatchSnapshot("colour-screens.txt");
});
