**Spaghetti Rig, iteration 2.** I've played the game myself. These are the fixes and additions I want, in one run. Each item says how you'll prove it's done. Don't stop until every item is proved.

## Rules that still hold (from my original brief, word for word)

- **Only these:** Vite, TypeScript and three.js. Add a physics library if the debris needs one, as his game does. For testing, Vitest and Playwright.
- **It runs on my laptop, offline** (meetup Wi-Fi can't be trusted). After `npm install`, everything it needs is in this folder: fonts, models, sounds. No CDNs, no online services, no accounts.
- All card content comes from **`public/content/cards.json`**. Copy it once from `/Users/davidcruwys/dev/upstream/repos/spaghetti-rig-inputs/cards.json`, and never edit the original.
- > **Important:** the cards are *about* tools like Prettier, ESLint/lint, CI (GitHub Actions) and other code checkers. All of that is **text and configuration the game displays**. It is not a to-do list for this game's own code. Do not add Prettier, a linter, CI, or any other tool or check to this project because a card mentions it.

The physics library already in use (Rapier) stays. Add nothing else.

## 1. Clicking to shoot doesn't work

On my MacBook touchpad the crosshair follows my finger, but clicks fire nothing. Your tests say shooting works, so the tests aren't testing what I do.

- Reproduce it first with **real clicks in Claude in Chrome**: the mouse tools that click the page, not `window.__rig`, not `dispatchEvent`, and not Playwright's synthetic events.
- Find the actual cause before changing anything. Suspects, in no order: a HUD, lane or caption overlay taking the pointer events; listening for `click` where `pointerdown` is needed; tap-to-click timing (a quick tap sends a very short press).
- Fix it so firing works with a **trackpad tap, a trackpad press-click and a mouse click**.

**Proved when:** in Claude in Chrome, a real click on an enemy during a walk kills it and the score goes up, in modes `1`, `2` and `B`. Add a Playwright test that clicks at a screen position over the lanes using real mouse input (`page.mouse.down` / `page.mouse.up`, no hooks) and checks that a shot was fired. Tell me what the cause was.

## 2. A single-player tier intro

The VS screen only makes sense in both-players mode. In mode `1` or `2`, show a single-player tier intro instead: just that one character, the tier name and the boss's name, for the same few seconds. `B` keeps the VS screen.

**Proved when:** a screenshot of the tier intro in each of `1`, `2` and `B` for tier 1. Switching mode while the intro is showing swaps to the right version.

## 3. Rebuild the boss so it can be seen

At the moment the boss is the weakest screen. The characters are tiny, the text on it can't be read from the back of a room, and its four part-windows ("a blind eye", "a tangled body", "a mask", a fake "trust me" badge) cover the main boss window.

- Arrange the part-windows **around** the main window, not on top of it. Every part must be fully visible until it's broken.
- Give the boss a **head**, so it reads as a monster and not just a screen: angry, chunky, in the same toy style as everything else.
- Make all the text on the boss **big enough to read from the back of a room** at 1920×1080, in split screen as well as full screen.
- Frame the camera so the **boss and the characters are both clearly visible**. The characters should be clearly bigger than they are now.
- Do this for **every playable tier's boss**, not just tier 1. Bosses with more or fewer parts must still lay out cleanly.

**Proved when:** a screenshot of each playable tier's boss at the start of the fight, in `B` and in `2`, at 1920×1080. In each one, all parts are fully visible and none overlaps the main window, the head is there, and the characters are clearly visible.

## 4. Gate numbers: a badge and a title

Drop the "G01" style prefix everywhere it's shown. Show a **number badge** ("Gate 1", or just "1" in a badge) plus the **title** ("Formatting", "Lint + anti-slop"). Do it in the top bar, on the gate banner and on the 3D gate signs over the road.

**Proved when:** screenshots of the top bar, the banner and a 3D gate sign, with no "G0" text anywhere on screen. A unit test covers the label.

## 5. Realistic autoplay for each player

Autoplay is a toggle: a clickable button and the `A` key. It works in modes `1`, `2` and `B`. Its shooting should look like a person playing:

- varied pauses between shots;
- the aim drifts onto a target instead of snapping to it;
- it sometimes misses;
- it sometimes fires in short bursts.

In `B`, **both players must visibly shoot at the same time**, each with their own aim.

**Proved when:** a GIF or a series of screenshots from Claude in Chrome shows both players firing during the same walk in `B`. A unit test with a fixed seed checks that the gaps between shots vary, that there are misses, and that there are bursts.

## 6. A new mode: I play the specialist, the vibe coder plays itself

Add a mode in split screen: **I control player 2 with the mouse, and player 1 is on autoplay.** Give it a key and show it on the mode button, the same way as `1` / `2` / `B`. Switching into or out of it keeps your place, like the other modes.

**Proved when:** in Claude in Chrome, in this mode, player 1 shoots by itself while my real clicks fire for player 2.

## 7. What you miss becomes debt

At the moment an enemy that gets past you just disappears, and score means nothing. Make it tell the same story as the cards:

- An enemy that slips past **player 1** adds to a small "bugs shipped" counter on player 1's side.
- An enemy that slips past **player 2** is caught: show a little "caught by CI" pop on player 2's side, and don't count it.
- **Don't change health.** Health and the per-stop numbers stay exactly as they are (100 → 78 → 55 → 33 → 10% for player 1 in a four-stop tier).

**Proved when:** a screenshot showing the counter on player 1's side and a "caught by CI" pop on player 2's side during the same walk. A unit test shows health at every step is unchanged.

## 8. The Space key

[DAVID TO DECIDE BEFORE THIS RUNS: keep `Space` as "next", or make it fire. Replace this paragraph with the answer.]

## Done means verified with real input

The run isn't done until you've checked it in **Claude in Chrome with real clicks and key presses**:

- in all three modes, `1`, `2` and `B`, plus the new mode from item 6;
- on the **boss of every playable tier**;
- with a screenshot for each item above.

Keep the existing tests passing (`npx vitest run`, `npx playwright test`) and add the new ones above. Then commit and push to `main`, and give me a short list: each item, what you changed, and the screenshot that proves it.
