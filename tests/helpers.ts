import { expect, type Page } from "@playwright/test";
import type { TestHooks } from "../src/testhooks";

/** Collect anything that would mean the show broke on stage. */
export function watchErrors(page: Page) {
  const errors: string[] = [];

  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push(`console: ${m.text()}`);
    }
  });

  return errors;
}

export async function boot(page: Page, url = "/") {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__rig, null, { timeout: 30_000 });
  await page.click("#enter");
  await expect(page.locator("#title")).toBeVisible();
}

export const step = (page: Page) =>
  page.evaluate(() => (window.__rig as TestHooks).director.step);
export const at = (page: Page) =>
  page.evaluate(() => (window.__rig as TestHooks).director.at);
/** Read the app's test hooks: the lambda is checked against TestHooks by tsc, then its source is serialised into the page and run on window.__rig, so it must not close over test-scope values. */
export const rig = <T>(page: Page, fn: (r: TestHooks) => T) =>
  page.evaluate(`(${fn.toString()})(window.__rig)`) as Promise<T>;

/** Press a key and give the frame loop a moment. */
export async function press(page: Page, key: string, wait = 120) {
  await page.keyboard.press(key);
  await page.waitForTimeout(wait);
}
