// Proves a stylesheet change did not change a single colour. Run it on the old tree and on the new one, then compare:
//   node scripts/computed-colours.mjs snapshot <url> <out.json>     (the game must be serving at <url>)
//   node scripts/computed-colours.mjs compare <old.json> <new.json> (exit 1 on any difference)
// A snapshot holds two things, both as the browser computes them (so #hex, rgba() and var() all compare as one value):
//   rules    every colour a style rule or keyframe declares, resolved on a probe element, even for states never shown
//   screens  every element's computed colours on each screen of the show, for the page, ::before and ::after
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

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
const SCREEN_KEYS = ["b", "1", "2"];
const SETTLE_MS = 250;
// Animations and transitions are frozen while the screens are read: an element caught mid-flash has a colour that depends on timing, not
// on the stylesheet. What the animations themselves colour is covered by `rules`, which resolves every keyframe directly.
const FREEZE =
  "*, *::before, *::after { animation: none !important; transition: none !important; }";
const VIEWPORT_WIDTH = 1600;
const VIEWPORT_HEIGHT = 900;
const PAGE_READY_TIMEOUT_MS = 30_000;
/** How many differences are printed before the rest are only counted. */
const MAX_LISTED = 40;

/** Runs in the page: every declared colour, resolved. */
function collectRules(properties) {
  const probe = document.createElement("div");

  document.body.append(probe);

  const read = () =>
    properties
      .map((p) => getComputedStyle(probe).getPropertyValue(p))
      .join(" | ");
  const blank = read();
  const out = {};
  const seen = {};

  // The whole rule at once: a var() inside a shorthand only resolves as part of its shorthand.
  const addDeclarations = (where, style) => {
    probe.style.cssText = style.cssText;

    const now = read();

    if (now !== blank) {
      seen[where] = (seen[where] ?? 0) + 1;
      out[`${where}|${seen[where]}`] = now;
    }
  };

  const walk = (rules, context) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        addDeclarations(`${context}${rule.selectorText}`, rule.style);
      } else if (rule instanceof CSSKeyframesRule) {
        for (const frame of rule.cssRules) {
          addDeclarations(
            `@keyframes ${rule.name} ${frame.keyText}`,
            frame.style,
          );
        }
      } else if (rule.cssRules) {
        walk(rule.cssRules, `${context}${rule.conditionText ?? ""} `);
      }
    }
  };

  for (const sheet of document.styleSheets) {
    walk(sheet.cssRules, "");
  }

  probe.remove();

  return out;
}

/** Runs in the page: every element's computed colours, keyed by its place in the document. */
function collectScreen(properties) {
  const out = {};
  const place = (el) => {
    const parts = [];

    for (let n = el; n?.nodeType === 1; n = n.parentElement) {
      const same = n.parentElement
        ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName)
        : [n];

      parts.unshift(
        `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ""}[${same.indexOf(n)}]`,
      );
    }

    return parts.join(">");
  };

  for (const el of document.querySelectorAll("body, body *")) {
    for (const pseudo of [null, "::before", "::after"]) {
      const style = getComputedStyle(el, pseudo);

      out[`${place(el)}${pseudo ?? ""}`] = properties
        .map((p) => style.getPropertyValue(p))
        .join(" | ");
    }
  }

  return out;
}

async function snapshot(url, file) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
  });
  const screens = {};
  const grab = async (name) => {
    await page.waitForTimeout(SETTLE_MS);
    screens[name] = await page.evaluate(collectScreen, COLOUR_PROPERTIES);
  };

  await page.goto(url);
  await page.addStyleTag({ content: FREEZE });
  await page.waitForFunction(() => !!window.__rig, null, {
    timeout: PAGE_READY_TIMEOUT_MS,
  });
  await page.click("#enter");
  await grab("title");

  const rules = await page.evaluate(collectRules, COLOUR_PROPERTIES);

  for (const mode of SCREEN_KEYS) {
    await page.keyboard.press(mode);
    await page.keyboard.press("Enter");
    await grab(`menu-${mode}`);
    await page.evaluate("window.__rig.start(0)");

    const steps = await page.evaluate("window.__rig.director.script.length");

    for (let i = 0; i < steps; i++) {
      await page.evaluate(`window.__rig.director.go(${i}, true)`);
      await grab(`mode-${mode}-step-${i}`);
    }

    for (const key of ["p", "p", "n", "n", "h", "Escape"]) {
      await page.keyboard.press(key);
      await grab(`mode-${mode}-key-${key}-${Object.keys(screens).length}`);
    }

    await page.reload();
    await page.addStyleTag({ content: FREEZE });
    await page.waitForFunction(() => !!window.__rig, null, {
      timeout: PAGE_READY_TIMEOUT_MS,
    });
    await page.click("#enter");
  }

  await page.goto(`${url}/?presenter`);
  await page.addStyleTag({ content: FREEZE });
  await grab("presenter");
  await browser.close();
  writeFileSync(file, JSON.stringify({ rules, screens }, null, 1));
  console.log(
    `${file}: ${Object.keys(rules).length} colour declarations, ${Object.keys(screens).length} screens`,
  );
}

function compare(oldFile, newFile) {
  const a = JSON.parse(readFileSync(oldFile, "utf8"));
  const b = JSON.parse(readFileSync(newFile, "utf8"));
  const problems = [];
  const diff = (label, x, y) => {
    for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (x[key] !== y[key]) {
        problems.push(`${label} ${key}\n   old: ${x[key]}\n   new: ${y[key]}`);
      }
    }
  };

  diff("rule", a.rules, b.rules);
  for (const name of new Set([
    ...Object.keys(a.screens),
    ...Object.keys(b.screens),
  ])) {
    diff(`screen ${name}`, a.screens[name] ?? {}, b.screens[name] ?? {});
  }

  const checked = Object.keys(a.rules).length + Object.keys(a.screens).length;

  if (checked === 0) {
    console.error(
      "computed-colours: the old snapshot is empty, so nothing was compared",
    );
    process.exit(1);
  }

  if (problems.length > 0) {
    console.error(
      `${problems.length} colour(s) differ:\n${problems.slice(0, MAX_LISTED).join("\n")}`,
    );
    process.exit(1);
  }

  console.log(
    `identical: ${Object.keys(a.rules).length} declared colours, ${Object.keys(a.screens).length} screens`,
  );
}

const [command, first, second] = process.argv.slice(2);

if (command === "snapshot" && first && second) {
  await snapshot(first, second);
} else if (command === "compare" && first && second) {
  compare(first, second);
} else {
  console.error(
    "usage: computed-colours.mjs snapshot <url> <out.json> | compare <old.json> <new.json>",
  );
  process.exit(1);
}
