import { expect, type Page } from "@playwright/test";

/** Collect anything that would mean the show broke on stage. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

export async function boot(page: Page, url = "/") {
  await page.goto(url);
  await page.waitForFunction(() => !!(window as any).__rig, null, {
    timeout: 30_000,
  });
  await page.click("#enter");
  await expect(page.locator("#title")).toBeVisible();
}

export const step = (page: Page) =>
  page.evaluate(
    () =>
      (window as any).__rig.director.step as {
        phase: string;
        tier: number;
        stop: number;
        part: number;
      },
  );
export const at = (page: Page) =>
  page.evaluate(() => (window as any).__rig.director.at as number);
export const rig = <T>(page: Page, fn: string) =>
  page.evaluate(
    `(() => { const r = window.__rig; return ${fn}; })()`,
  ) as Promise<T>;

/** Press a key and give the frame loop a moment. */
export async function press(page: Page, key: string, wait = 120) {
  await page.keyboard.press(key);
  await page.waitForTimeout(wait);
}
