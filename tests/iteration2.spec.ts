import { expect, test, type Page } from "@playwright/test";
import { boot, press, rig, step, watchErrors } from "./helpers";

// Input here is real: page.mouse and page.keyboard only. __rig is used to read state, never to drive it.

const W = 1600;
const H = 900;
const shots = (page: Page) =>
  rig(page, (r) => ({ p1: r.worlds.p1.shots, p2: r.worlds.p2.shots }));

/** Pick a mode and start walking tier 1, with keys. */
async function walk(page: Page, modeKey: string) {
  await press(page, modeKey);
  await press(page, "Shift+Digit1", 400);
  await press(page, "ArrowRight", 300);
  expect((await step(page)).phase).toBe("walk");
}

/** A real press and release of the left button at a screen position, as a click or trackpad tap makes. */
async function tap(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(80);
}

for (const [key, lanes] of [
  ["1", { p1: W / 2 }],
  ["2", { p2: W / 2 }],
  ["b", { p1: W / 4, p2: (W * 3) / 4 }],
] as const) {
  test(`mode ${key}: a real mouse press over the lanes fires a shot`, async ({
    page,
  }) => {
    const errors = watchErrors(page);

    await boot(page);
    await walk(page, key);
    for (const [p, x] of Object.entries(lanes) as ["p1" | "p2", number][]) {
      const before = await shots(page);

      await tap(page, x, H * 0.45);

      const after = await shots(page);

      expect(after[p]).toBe(before[p] + 1);
    }

    expect(errors).toEqual([]);
  });
}

test("a real click on an enemy kills it and the score goes up", async ({
  page,
}) => {
  await boot(page);
  await walk(page, "2");

  let score = 0;

  for (let i = 0; i < 80 && score === 0; i++) {
    await page.waitForTimeout(80);

    const e = await rig(page, (r) => r.worlds.p2.enemyScreen());

    if (!e || Math.abs(e.x) > 0.95 || Math.abs(e.y) > 0.6) {
      continue;
    }

    await tap(page, ((e.x + 1) / 2) * W, ((1 - e.y) / 2) * H);
    score = await rig(page, (r) => r.worlds.p2.score);
  }

  expect(score).toBeGreaterThan(0);
});

test("Space moves the show on and never fires; Page Down and Page Up step forward and back", async ({
  page,
}) => {
  await boot(page);
  await walk(page, "b");

  const before = await shots(page);
  const at = await rig(page, (r) => r.director.at);

  await press(page, "Space", 300);
  expect(await rig(page, (r) => r.director.at)).toBe(at + 1);
  expect(await shots(page)).toEqual(before);
  await press(page, "PageDown", 300);
  expect(await rig(page, (r) => r.director.at)).toBe(at + 2);
  await press(page, "PageUp", 300);
  expect(await rig(page, (r) => r.director.at)).toBe(at + 1);
  expect(await shots(page)).toEqual(before);
});

test("Space after clicking the autoplay button still means next, not the button", async ({
  page,
}) => {
  await boot(page);
  await walk(page, "2");
  await page.click('[data-chip="auto"]');
  await expect(page.locator("#hud-auto")).toHaveText("AUTOPLAY ON");

  const at = await rig(page, (r) => r.director.at);

  await press(page, "Space", 300);
  expect(await rig(page, (r) => r.director.at)).toBe(at + 1);
  await expect(page.locator("#hud-auto")).toHaveText("AUTOPLAY ON");
});

test("autoplay in B: both players fire during the same walk, each with their own aim", async ({
  page,
}) => {
  await boot(page);
  await walk(page, "b");
  await press(page, "a");

  const before = await shots(page);

  // Wait for the shots, not for a fixed time: autoplay fires on the game clock, so a slow runner fires fewer in the same wall-clock span.
  await expect
    .poll(async () => (await shots(page)).p1, { timeout: 30_000 })
    .toBeGreaterThan(before.p1 + 2);
  await expect
    .poll(async () => (await shots(page)).p2, { timeout: 30_000 })
    .toBeGreaterThan(before.p2 + 2);
  await expect(page.locator(".lane[data-p='p1'] .reticle.auto")).toBeVisible();
  await expect(page.locator(".lane[data-p='p2'] .reticle.auto")).toBeVisible();
});

test("mode S: player 1 plays itself, real clicks fire for player 2 only", async ({
  page,
}) => {
  const errors = watchErrors(page);

  await boot(page);
  await walk(page, "s");
  await expect(page.locator(".lane")).toHaveCount(2);
  await expect(page.locator("#hud-mode")).toHaveText("YOU VS AUTOPILOT");

  const before = await shots(page);

  // Nobody touched the mouse: wait until player 1's autopilot has fired as many shots as autoplay in B needs to show an autopilot
  // is running (more than 2), so an autopilot on player 2 would have fired too. Then player 2 must still be at its old count.
  await expect
    .poll(async () => (await shots(page)).p1, { timeout: 30_000 })
    .toBeGreaterThan(before.p1 + 2);

  const mid = await shots(page);

  expect(mid.p2).toBe(before.p2);
  await tap(page, (W * 3) / 4, H * 0.45);
  expect((await shots(page)).p2).toBe(mid.p2 + 1);

  // A press over player 1's lane does not fire for anyone but player 1's autopilot.
  const p2 = (await shots(page)).p2;

  await tap(page, W / 4, H * 0.45);
  expect((await shots(page)).p2).toBe(p2);

  // Switching in and out keeps your place.
  const at = await rig(page, (r) => r.director.at);

  for (const k of ["b", "s", "2", "s"]) {
    await press(page, k, 200);
    expect(await rig(page, (r) => r.director.at)).toBe(at);
  }

  expect(errors).toEqual([]);
});

test("what you miss becomes debt: bugs shipped for player 1, caught by CI for player 2, health untouched", async ({
  page,
}) => {
  await boot(page);
  await walk(page, "b");
  // Nobody shoots; let the street walk past.
  await expect
    .poll(() => rig(page, (r) => r.worlds.p1.shipped), { timeout: 12_000 })
    .toBeGreaterThan(0);
  await expect(page.locator(".lane[data-p='p1'] .shipped")).not.toHaveText("0");
  await expect(
    page.locator(".lane[data-p='p2'] .ci-pop").first(),
  ).toBeAttached();
  await expect(page.locator(".lane[data-p='p2'] .shipped")).toHaveCount(0);
  expect(await rig(page, (r) => r.worlds.p1.health)).toBe(100);
  expect(await rig(page, (r) => r.worlds.p2.health)).toBe(100);
});

test("single-player modes get a solo tier intro; B keeps the VS screen", async ({
  page,
}) => {
  await boot(page);
  await press(page, "1");
  await press(page, "Shift+Digit1", 300);
  await expect(page.locator("#vs .solo-card")).toContainText("Vibe coder");
  await expect(page.locator("#vs .vsword")).toHaveCount(0);
  await press(page, "2", 200);
  await expect(page.locator("#vs .solo-card")).toContainText("Specialist");
  await press(page, "b", 200);
  await expect(page.locator("#vs .vsword")).toBeVisible();
  await expect(page.locator("#vs .solo-card")).toHaveCount(0);
});

test("gates show a number badge and a title, never a G0 code", async ({
  page,
}) => {
  await boot(page);
  await walk(page, "b");
  await expect(page.locator("#hud-stop .gate-badge")).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await expect(page.locator("#game")).not.toContainText(/G\d\d/);
    await press(page, "ArrowRight", 250);
  }
});
