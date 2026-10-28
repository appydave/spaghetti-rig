import { expect, test, type Page } from "@playwright/test";
import type { TestHooks } from "#root/src/testhooks.ts";
import {
  at,
  boot,
  press,
  rig,
  step,
  watchErrors,
} from "#root/tests/helpers.ts";

/** From the title, pick both players and open the map, moving the tier choice right and back with the keys, then start tier 1. */
async function openTierOneByKeys(page: Page) {
  await expect(page.locator("#title-1")).toHaveText("SPAGHETTI");
  await press(page, "b");
  await press(page, "Enter", 400);
  await expect(page.locator("#map")).toBeVisible();
  await expect(page.locator(".tier.locked")).toHaveCount(0);
  await press(page, "ArrowRight", 200);
  await expect(page.locator("#tiers .tier.sel")).toHaveAttribute("data-i", "1");
  await press(page, "ArrowLeft", 200);
  await expect(page.locator("#tiers .tier.sel")).toHaveAttribute("data-i", "0");
  await press(page, "Enter", 600);
  await expect(page.locator("#game")).toBeVisible();
  expect((await step(page)).phase).toBe("vs");
}

/** Press "next" through the whole script to the ending; returns every phase seen on the way. */
async function walkToTheEnding(page: Page): Promise<Set<string>> {
  const total = await rig(page, (r) => r.director.script.length);
  const seen = new Set<string>();

  for (let i = 0; i < total + 5; i++) {
    const s = await step(page);

    seen.add(s.phase);
    if (s.phase === "ending") {
      break;
    }

    // Let some steps play their animations, so slams, shatters and boss blows really run.
    await press(
      page,
      "ArrowRight",
      ["problem", "fixed", "bossPart", "bossDown"].includes(s.phase)
        ? 900
        : 200,
    );
  }

  return seen;
}

test("the whole show runs from the keyboard alone, side by side, with no errors", async ({
  page,
}) => {
  const errors = watchErrors(page);

  await boot(page);
  await openTierOneByKeys(page);

  const seen = await walkToTheEnding(page);

  expect((await step(page)).phase).toBe("ending");
  for (const p of [
    "vs",
    "walk",
    "problem",
    "tool",
    "fixed",
    "boss",
    "bossPart",
    "bossDown",
    "result",
  ]) {
    expect(seen).toContain(p);
  }

  await expect(page.locator("#ending .col")).toHaveCount(2);
  await expect(page.locator("#ending")).toContainText("Buried in spaghetti");
  await expect(page.locator("#ending")).toContainText("Shipped");
  await press(page, "ArrowRight", 400);
  await expect(page.locator("#map")).toBeVisible();
  expect(errors).toEqual([]);
});

for (const mode of ["1", "2"] as const) {
  test(`player ${mode} alone plays a tier through to its result`, async ({
    page,
  }) => {
    const errors = watchErrors(page);

    await boot(page);
    await press(page, mode);
    await press(page, "Shift+Digit3", 600);
    expect((await step(page)).tier).toBe(2);

    const phases: string[] = [];

    for (let i = 0; i < 30; i++) {
      const s = await step(page);

      phases.push(s.phase);
      if (s.phase === "result") {
        break;
      }

      await press(page, "ArrowRight", 500);
    }

    expect(phases.at(-1)).toBe("result");
    if (mode === "1") {
      expect(phases).not.toContain("tool");
    } else {
      expect(phases).toContain("tool");
    }

    await expect(page.locator(".lane")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test("switching mode mid-game keeps your place", async ({ page }) => {
  await boot(page);
  await rig(page, (r) => r.start(0));
  await rig(page, (r) =>
    r.director.go(
      r.director.script.findIndex((s) => s.phase === "tool"),
      true,
    ),
  );

  const before = await at(page);

  for (const k of ["1", "2", "b", "1", "b"]) {
    await press(page, k, 250);
    expect(await at(page)).toBe(before);
  }

  await expect(page.locator(".lane")).toHaveCount(2);
  await expect(page.locator(".divider")).toBeVisible();
});

test("the tool card flies in over player 2 only, then fixes the code and heals", async ({
  page,
}) => {
  await boot(page);
  await rig(page, (r) => r.start(0));
  await rig(page, (r) =>
    r.director.go(
      r.director.script.findIndex((s) => s.phase === "problem"),
      true,
    ),
  );
  // Wait for the hit to land, not for a fixed time: health is tweened in game time, so a slow runner reads it mid-fall.
  await expect
    .poll(() => rig(page, (r) => r.worlds.p1.health), { timeout: 15_000 })
    .toBeCloseTo(77.5, 0);
  await expect
    .poll(() => rig(page, (r) => r.worlds.p2.health), { timeout: 15_000 })
    .toBeCloseTo(77.5, 0);
  await press(page, "ArrowRight", 900);
  expect((await step(page)).phase).toBe("tool");
  await expect(page.locator(".lane[data-p='p2'] .tcard")).toHaveCount(1);
  await expect(page.locator(".lane[data-p='p1'] .tcard")).toHaveCount(0);

  // The card face shows the real configuration from the content file.
  const cfg = await rig(
    page,
    (r) => r.game.content.tools[r.game.tiers[0]!.stops[0]!.p2.tool!]!.config!,
  );

  await expect(page.locator(".tcard .cfg")).toContainText(cfg.file);
  await expect(page.locator(".tcard .cfg")).toContainText(cfg.lines[0]![0]!);
  await press(page, "ArrowRight");
  expect((await step(page)).phase).toBe("fixed");
  await expect
    .poll(() => rig(page, (r) => r.worlds.p2.health), { timeout: 15_000 })
    .toBeCloseTo(100, 0);
  expect(await rig(page, (r) => r.worlds.p1.health)).toBeCloseTo(77.5, 0);
  expect(await rig(page, (r) => r.worlds.p2.street.windowKey)).toContain(
    "fixed",
  );
  await expect(
    page.locator(".lane[data-p='p2'] .tray .slot.earned"),
  ).toHaveCount(1);
  await expect(
    page.locator(".lane[data-p='p1'] .tray .slot.earned"),
  ).toHaveCount(0);
  // The old window shattered into physical pieces.
  expect(await rig(page, (r) => r.worlds.p2.debris.count)).toBeGreaterThan(10);
});

test("player 1 reaches the boss on 10% and the boss finishes them; player 2 wins", async ({
  page,
}) => {
  await boot(page);
  await rig(page, (r) => r.start(0));
  await rig(page, (r) =>
    r.director.go(
      r.director.script.findIndex((s) => s.phase === "boss"),
      false,
    ),
  );
  // Player 1 sits at 10% only until the boss lands its blow, so sample every frame rather than at one wall-clock moment.
  await page.waitForFunction(
    () => Math.abs((window.__rig as TestHooks).worlds.p1.health - 10) < 0.5,
    null,
    { polling: "raf", timeout: 15_000 },
  );
  await expect(page.locator(".lane[data-p='p2'] .bossbar")).toBeVisible();
  await press(page, "ArrowRight");
  await expect
    .poll(() => rig(page, (r) => r.worlds.p1.health), { timeout: 15_000 })
    .toBeLessThan(1);
  await expect
    .poll(() => rig(page, (r) => r.worlds.p2.street.bossLeft), {
      timeout: 15_000,
    })
    .toBe((await rig(page, (r) => r.worlds.p2.street.bossTotal)) - 1);
  expect(await rig(page, (r) => r.worlds.p1.street.bossLeft)).toBe(
    await rig(page, (r) => r.worlds.p1.street.bossTotal),
  );
});
