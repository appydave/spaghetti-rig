import { expect, test } from "@playwright/test";
import { at, boot, press, rig, step, watchErrors } from "./helpers";

test("the whole show runs from the keyboard alone, side by side, with no errors", async ({
  page,
}) => {
  const errors = watchErrors(page);

  await boot(page);
  await expect(page.locator("#title-1")).toHaveText("SPAGHETTI");
  await press(page, "b");
  await press(page, "Enter", 400);
  await expect(page.locator("#map")).toBeVisible();
  await expect(page.locator(".tier.locked")).toHaveCount(0);
  await press(page, "Enter", 600);
  await expect(page.locator("#game")).toBeVisible();
  expect((await step(page)).phase).toBe("vs");

  const total = await rig<number>(page, "r.director.script.length");
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
  await rig(page, "r.start(0)");
  await rig(
    page,
    `r.director.go(r.director.script.findIndex(s => s.phase === 'tool'), true)`,
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
  await rig(page, "r.start(0)");
  await rig(
    page,
    `r.director.go(r.director.script.findIndex(s => s.phase === 'problem'), true)`,
  );
  // Wait for the hit to land, not for a fixed time: health is tweened in game time, so a slow runner reads it mid-fall.
  await expect
    .poll(() => rig<number>(page, "r.worlds.p1.health"), { timeout: 15_000 })
    .toBeCloseTo(77.5, 0);
  await expect
    .poll(() => rig<number>(page, "r.worlds.p2.health"), { timeout: 15_000 })
    .toBeCloseTo(77.5, 0);
  await press(page, "ArrowRight", 900);
  expect((await step(page)).phase).toBe("tool");
  await expect(page.locator(".lane[data-p='p2'] .tcard")).toHaveCount(1);
  await expect(page.locator(".lane[data-p='p1'] .tcard")).toHaveCount(0);

  // The card face shows the real configuration from the content file.
  const cfg = await rig<{ file: string; lines: string[][] }>(
    page,
    `r.game.content.tools[r.game.tiers[0].stops[0].p2.tool].config`,
  );

  await expect(page.locator(".tcard .cfg")).toContainText(cfg.file);
  await expect(page.locator(".tcard .cfg")).toContainText(cfg.lines[0]![0]!);
  await press(page, "ArrowRight");
  expect((await step(page)).phase).toBe("fixed");
  await expect
    .poll(() => rig<number>(page, "r.worlds.p2.health"), { timeout: 15_000 })
    .toBeCloseTo(100, 0);
  expect(await rig<number>(page, "r.worlds.p1.health")).toBeCloseTo(77.5, 0);
  expect(await rig<string>(page, "r.worlds.p2.window.key")).toContain("fixed");
  await expect(
    page.locator(".lane[data-p='p2'] .tray .slot.earned"),
  ).toHaveCount(1);
  await expect(
    page.locator(".lane[data-p='p1'] .tray .slot.earned"),
  ).toHaveCount(0);
  // The old window shattered into physical pieces.
  expect(await rig<number>(page, "r.worlds.p2.debrisCount")).toBeGreaterThan(
    10,
  );
});

test("player 1 reaches the boss on 10% and the boss finishes them; player 2 wins", async ({
  page,
}) => {
  await boot(page);
  await rig(page, "r.start(0)");
  await rig(
    page,
    `r.director.go(r.director.script.findIndex(s => s.phase === 'boss'), false)`,
  );
  // Player 1 sits at 10% only until the boss lands its blow, so sample every frame rather than at one wall-clock moment.
  await page.waitForFunction(
    () => Math.abs((window as any).__rig.worlds.p1.health - 10) < 0.5,
    null,
    { polling: "raf", timeout: 15_000 },
  );
  await expect(page.locator(".lane[data-p='p2'] .bossbar")).toBeVisible();
  await press(page, "ArrowRight");
  await expect
    .poll(() => rig<number>(page, "r.worlds.p1.health"), { timeout: 15_000 })
    .toBeLessThan(1);
  await expect
    .poll(() => rig<number>(page, "r.worlds.p2.bossLeft"), { timeout: 15_000 })
    .toBe((await rig<number>(page, "r.worlds.p2.bossTotal")) - 1);
  expect(await rig<number>(page, "r.worlds.p1.bossLeft")).toBe(
    await rig<number>(page, "r.worlds.p1.bossTotal"),
  );
});

test("back steps, tier jumps and locked tiers", async ({ page }) => {
  // A tier with no stops in the content file is locked: take tier 6's stops away to see it.
  await page.route("**/content/cards.json", async (route) => {
    const res = await route.fetch();
    const json = await res.json();

    json.stops = json.stops.filter(
      (s: { tier: string }) => s.tier !== "architecture",
    );
    await route.fulfill({ response: res, json });
  });
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
  await rig(page, "r.start(0)");
  await press(page, "p");
  await expect(page.locator("#pause")).toBeVisible();
  await press(page, "p");
  await expect(page.locator("#pause")).toBeHidden();
  await press(page, "m");
  expect(await rig<boolean>(page, "r.audio.muted")).toBe(true);
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
  await rig(page, "r.start(0)");
  await rig(page, `r.director.go(1, true)`);

  let hit = false;

  for (let i = 0; i < 60 && !hit; i++) {
    await page.waitForTimeout(100);

    const e = await rig<{ x: number; y: number } | null>(
      page,
      "r.worlds.p2.enemyScreen()",
    );

    if (!e) {
      continue;
    }

    await page.mouse.click(((e.x + 1) / 2) * 1600, ((1 - e.y) / 2) * 900);
    hit = (await rig<number>(page, "r.worlds.p2.score")) > 0;
  }

  await press(page, "a", 5000);
  expect(await rig<number>(page, "r.worlds.p2.score")).toBeGreaterThan(0);
});

test("the presenter window follows the game", async ({ page, context }) => {
  await boot(page);

  const presenter = await context.newPage();

  await presenter.goto("/?presenter");
  await rig(page, "r.start(0)");
  await rig(
    page,
    `r.director.go(r.director.script.findIndex(s => s.phase === 'problem'), false)`,
  );

  const card = await rig<{ id: string; say: string }>(
    page,
    "r.game.tiers[0].stops[0].p1",
  );

  await expect(presenter.locator("#presenter")).toContainText(card.id);
  await expect(presenter.locator("#presenter .say")).toHaveText(card.say);
  // And can drive it.
  await presenter.keyboard.press("ArrowRight");
  await expect.poll(() => step(page).then((s) => s.phase)).toBe("tool");
});

test("a stop added to the content file shows up after a reload, unlocking its tier", async ({
  page,
}) => {
  await page.route("**/content/cards.json", async (route) => {
    const res = await route.fetch();
    const json = await res.json();

    json.stops = json.stops.filter(
      (s: { tier: string }) => s.tier !== "architecture",
    );
    json.stops.push({
      ...json.stops[1],
      tier: "architecture",
      gate: "G13 · Brand new gate",
    });
    await route.fulfill({ response: res, json });
  });
  await boot(page);
  await press(page, "Enter", 400);
  await expect(page.locator(".tier.locked")).toHaveCount(0);
  await press(page, "Shift+Digit6", 600);
  expect((await step(page)).tier).toBe(5);
  await rig(
    page,
    `r.director.go(r.director.script.findIndex(s => s.tier === 5 && s.phase === 'problem'), false)`,
  );
  await expect(page.locator("#hud-stop .gate-title")).toHaveText(
    "Brand new gate",
  );
  await expect(page.locator("#hud-stop .gate-badge")).toHaveText("GATE13");
});
