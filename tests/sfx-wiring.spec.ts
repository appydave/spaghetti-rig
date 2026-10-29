// The sound effects are wired in main.ts: this fails if the app is built with an effects maker that plays nothing. Unit tests cannot see
// main.ts, and the other specs never look at sound. Every effect starts at SfxPlayer.sfxOut, which makes a stereo panner; the music makes
// its own panners too, so the init script counts only those made from sfx-player.ts (read off the call stack: the dev server serves each
// module under its own file name). The count is polled until the effect has started, so nothing waits on the clock.
import { expect, test } from "@playwright/test";
import { boot, press, rig } from "#root/tests/helpers.ts";

const COUNT = "__sfxPanners";

test("a keypress that makes a sound starts a sound effect", async ({
  page,
}) => {
  await page.addInitScript(`
    window.${COUNT} = 0;
    const make = AudioContext.prototype.createStereoPanner;
    AudioContext.prototype.createStereoPanner = function () {
      if (new Error().stack.includes("/sfx-player.ts")) {
        window.${COUNT} += 1;
      }
      return make.call(this);
    };
  `);
  await boot(page);
  await rig(page, (r) => r.start(0));

  // Entering the show already played effects: count from here.
  const before = Number(await page.evaluate(`window.${COUNT}`));

  // "a" toggles autoplay and plays the UI-move effect.
  await press(page, "a");
  await expect
    .poll(() => page.evaluate(`window.${COUNT}`))
    .toBeGreaterThan(before);
});
