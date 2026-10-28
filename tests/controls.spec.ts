// The show's controls and its edges: going back, jumping tiers and locked tiers, pause, mute, autoplay, notes and help, shooting with the
// mouse, the presenter window, and a stop added to the content file. Split out of show.spec.ts, which keeps the show played through.
import { expect, test } from "@playwright/test";
import {
  at,
  boot,
  press,
  rig,
  serveContentWithoutTier,
  step,
} from "#root/tests/helpers.ts";

test("back steps, tier jumps and locked tiers", async ({ page }) => {
  // A tier with no stops in the content file is locked: take tier 6's stops away to see it.
  await serveContentWithoutTier(page, "architecture");
  await boot(page);
  await press(page, "Shift+Digit2", 500);
  expect((await step(page)).tier).toBe(1);
  await press(page, "ArrowRight", 300);
  await press(page, "ArrowRight", 300);

  const here = await at(page);

  await press(page, "ArrowLeft", 300);
  expect(await at(page)).toBe(here - 1);
  await press(page, "Shift+Digit6", 300);
  expect((await step(page)).tier).toBe(1); // locked: nothing happens
});

test("controls: pause, mute, autoplay, notes and help", async ({ page }) => {
  await boot(page);
  await rig(page, (r) => r.start(0));
  await press(page, "p");
  await expect(page.locator("#pause")).toBeVisible();
  await press(page, "p");
  await expect(page.locator("#pause")).toBeHidden();
  await press(page, "m");
  expect(await rig(page, (r) => r.audio.muted)).toBe(true);
  await press(page, "m");
  await press(page, "a");
  await expect(page.locator("#hud-auto")).toHaveText("AUTOPLAY ON");
  await press(page, "n");
  await expect(page.locator("#notes")).toBeVisible();
  await press(page, "h");
  await expect(page.locator("#help")).toBeVisible();
  await press(page, "Escape");
  await expect(page.locator("#help")).toBeHidden();
});

test("mouse shooting scores, autoplay clears the street", async ({ page }) => {
  await boot(page);
  await press(page, "2");
  await rig(page, (r) => r.start(0));
  await rig(page, (r) => r.director.go(1, true));

  let hit = false;

  for (let i = 0; i < 60 && !hit; i++) {
    await page.waitForTimeout(100);

    const e = await rig(page, (r) => r.worlds.p2.combat.enemyScreen());

    if (!e) {
      continue;
    }

    await page.mouse.click(((e.x + 1) / 2) * 1600, ((1 - e.y) / 2) * 900);
    hit = (await rig(page, (r) => r.worlds.p2.combat.score)) > 0;
  }

  await press(page, "a", 5000);
  expect(await rig(page, (r) => r.worlds.p2.combat.score)).toBeGreaterThan(0);
});

test("the presenter window follows the game", async ({ page, context }) => {
  await boot(page);

  const presenter = await context.newPage();

  await presenter.goto("/?presenter");
  await rig(page, (r) => r.start(0));
  await rig(page, (r) =>
    r.director.go(
      r.director.script.findIndex((s) => s.phase === "problem"),
      false,
    ),
  );

  const card = await rig(page, (r) => r.game.tiers[0]!.stops[0]!.p1);

  await expect(presenter.locator("#presenter")).toContainText(card.id);
  await expect(presenter.locator("#presenter .say")).toHaveText(card.say!);
  // And can drive it.
  await presenter.keyboard.press("ArrowRight");
  await expect.poll(() => step(page).then((s) => s.phase)).toBe("tool");
});

test("a stop added to the content file shows up after a reload, unlocking its tier", async ({
  page,
}) => {
  await serveContentWithoutTier(page, "architecture", (stops) => [
    ...stops,
    { ...stops[1], tier: "architecture", gate: "G13 · Brand new gate" },
  ]);
  await boot(page);
  await press(page, "Enter", 400);
  await expect(page.locator(".tier.locked")).toHaveCount(0);
  await press(page, "Shift+Digit6", 600);
  expect((await step(page)).tier).toBe(5);
  await rig(page, (r) =>
    r.director.go(
      r.director.script.findIndex((s) => s.tier === 5 && s.phase === "problem"),
      false,
    ),
  );
  await expect(page.locator("#hud-stop .gate-title")).toHaveText(
    "Brand new gate",
  );
  await expect(page.locator("#hud-stop .gate-badge")).toHaveText("GATE13");
});
