import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  collectRules,
  collectScreen,
  type ScreenColours,
} from "#root/tests/colour-collectors.ts";
import { boot } from "#root/tests/helpers.ts";

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
// The same settle time in the game's own seconds. The health bar and other HUD colours follow the game clock, which advances by at most
// 0.05 s a frame, so a slow runner reaches less game time in 250 ms of wall time than a fast one and would be read earlier in the show.
const SETTLE_GAME_SECONDS = SETTLE_MS / 1000;
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
  const gameClock = async () =>
    Number(await page.evaluate("window.__rig?.director.clock ?? 0"));
  // Read a screen once SETTLE_MS of wall time AND SETTLE_GAME_SECONDS of game time have passed since `since` (a gameClock() reading taken
  // before the action), and the frame that applies the game's HUD has run. A director that is not running has no game time to wait for.
  const grab = async (name: string, since = 0) => {
    await page.waitForTimeout(SETTLE_MS);
    await page.waitForFunction(
      `(() => { const d = window.__rig?.director; return !d || !d.active || d.paused || d.clock - ${since} >= ${SETTLE_GAME_SECONDS}; })()`,
    );
    await page.evaluate(
      "new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))",
    );
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
      const since = await gameClock();

      await page.evaluate(`window.__rig.director.go(${i}, true)`);
      await grab(`mode-${mode}-step-${i}`, since);
    }

    for (const key of AFTER_KEYS) {
      const since = await gameClock();

      await page.keyboard.press(key);
      await grab(`mode-${mode}-key-${key}-${screens.size}`, since);
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

// The game's stylesheet has no @media or @supports block today, so the collector's walk into conditional rules would go untested: this
// fixture nests one inside another and checks that both declarations are read, each keyed by the conditions around it. It reads font-size
// rather than a colour, which the collector accepts like any property, so the fixture needs no colour literal.
test("the rule collector reads declarations nested inside @media and @supports", async ({
  page,
}) => {
  await page.setContent(
    "<style>@media (min-width: 1px) { .outer { font-size: 11px; } @supports (display: block) { .inner { font-size: 12px; } } }</style>",
  );

  const rules = await page.evaluate(collectRules, ["font-size"]);

  expect(rules).toEqual({
    "(min-width: 1px) .outer|1": "11px",
    "(min-width: 1px) (display: block) .inner|1": "12px",
  });
});
