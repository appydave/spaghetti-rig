# Spaghetti Rig: the build record

Session `b4742cca-cf21-496c-931e-aa3649cba10f` (`spgame-builder`) on Roamy, cwd `/Users/davidcruwys/dev/ad/apps/spaghetti-rig`. Times are Roamy local (+07:00).

## Iteration 1: the one-shot build

- **Launched** 2026-10-22 16:13 with the brief in `2-ai-spec.md` as its only prompt: `claude --safe-mode --model claude-opus-5-5 --permission-mode auto -n spgame-builder`. `--safe-mode` kept David's CLAUDE.md, plugins, skills and hooks away from the builder, so it ran as stock Claude Code.
- **Inputs it could see:** Omer Gilad's pre-gate snapshot (`/Users/davidcruwys/dev/upstream/repos/spaghetti-busters-pregate-cce0b46`) and the isolated inputs folder (`/Users/davidcruwys/dev/upstream/repos/spaghetti-rig-inputs`: `cards.json`, `lofi-demo.html`, `game-forms.html`).
- **Committed** `634a53c` at 17:19: "Build Spaghetti Rig: a 3D rail shooter companion to Spaghetti Busters". 77 files, about 6,080 lines of TypeScript, CSS and HTML.
- **According to the `spgame-dev` session that ran it:** 1 h 03 m, 108 tool calls, 2 subagents (the builder's own choice), about 629k output tokens.

What it built, in order:

1. **Scaffold:** Vite, TypeScript, three.js, Rapier; Vitest and Playwright; the two OFL fonts copied from Omer's repo.
2. **Content and show logic:** `cards.json` copied once; a tolerant loader; a step script (VS, walk, problem, tool, fixed, boss, boss part, boss down, result, ending), with health at 90% ÷ stops; the director that drives keys, modes and the presenter window.
3. **The 3D world:** toon materials with outlines; an instanced mint city; gates; code windows that crack and shatter into Rapier debris; the two characters; enemies; the boss; effects; one renderer with split-screen viewports.
4. **Helper agents:**
   - an audio agent wrote 9 Web Audio tracks and the sound effects;
   - an art agent drew 34 SVGs for tools, tiers, bosses and decoration.
5. **Tests:**
   - 55 Vitest unit tests;
   - 11 Playwright browser tests, including a full keyboard playthrough of all 94 steps.
6. **Commit and push** to https://github.com/appydave/spaghetti-rig.

## After iteration 1, same session

- **Network access** (`8346deb`, 20:35). Vite blocked the game when it was opened from the M4 as `roamy.local` or by its Tailscale name ("This host is not allowed"). The fix allows `.local` and `.ts.net` names and listens on the network by default.
- **A Chrome playthrough and fixes** (`624c2fd`, 20:42). The session was restarted without `--safe-mode` and with `--chrome`, so it could drive David's Chrome through Claude in Chrome. It played tier 1 in `B`, `1` and `2`, plus the ending, and fixed:
  - player 1's trailing problem cards filling the camera and covering the result stamp;
  - annotation pins drawn over the code that follows a mark;
  - CI steps on the tool card wrapping mid-command;
  - the result-screen score overlapping the characters.

  It reported, but didn't fix:
  - the boss fight is too small to read;
  - the CI tool card's config doesn't match the fixed code shown after it, which is a content issue in `cards.json`;
  - player 2's health dips when the boss arrives;
  - the notes strip covers the tray;
  - the top bar on the ending still shows the last tier.

## What the Chrome pass missed

- **Clicking to shoot.** David found that trackpad clicks fire nothing, though the aim follows. The Chrome pass never clicked an enemy:
  - it drove the game with keys and the `__rig` dev hook, and turned on autoplay;
  - it described shooting as working from reading the code and from a Playwright test that uses synthetic mouse events.
- **The boss.** It flagged the boss as small, but not:
  - that the part-windows cover the main window;
  - that the boss has no head;
  - that the boss is unreadable from a room.

  It looked only at tier 1's boss.
- **The VS screen in single-player modes.** It showed `1` and `2` during a walk, but never looked at the VS screen in those modes.

## David's hands-on findings

These became the iteration 2 refactor prompt, `4-refactor-prompt.md`:

1. clicking to shoot;
2. a single-player tier intro;
3. rebuilding the boss;
4. gate numbers as a badge plus a title;
5. realistic autoplay;
6. a P2-human, P1-autopilot mode;
7. missed enemies becoming debt;
8. what the Space key does.

## Iteration 2: the refactor prompt

Session `fa7c3c07-6660-4878-b255-387e775259ad` on Roamy, cwd `/Users/davidcruwys/dev/ad/apps/spaghetti-rig`, with Claude in Chrome connected. Its only prompt: run `4-refactor-prompt.md`, prove every item with real input in Chrome, don't touch the input `cards.json` or `docs/origin/`, and add no new libraries or tools.

- **Committed** `6844028` at 07:47 on 2026-10-23 (prompt committed at 06:53 as `f39d557`): "Iteration 2: real clicks fire, solo intro, a boss you can read, gate badges, human autoplay, mode S, bugs shipped, clicker keys". 61 files, +939 / −142 lines, counting the proof screenshots.
- **Dependencies:** none added; `package.json` is unchanged.
- **Tests:**
  - Vitest went from 55 to 77 tests.
  - Playwright went from 11 to 22 tests. The new ones drive the game with `page.mouse` and `page.keyboard` only; `__rig` is used to read state, never to drive the game.
- **Proof:** screenshots in `docs/proof/iteration-2/`.

What it did, item by item:

1. **Clicking to shoot.** It reproduced the bug first with real clicks in Chrome: every press landed on `#stage` and the score stayed at 0.
   - **Cause:** the HUD lets clicks pass through, so a click over the street lands on the canvas. The canvas sits beside `#game`, not inside it, and the fire listener was only on `#game`. Aiming worked because the canvas did have a `pointermove` listener.
   - **Fix:** firing listens for `pointerdown` on the window, so a short trackpad tap counts. Buttons, links, cards and overlays are still ignored.
   - **Check:** the new Playwright test fails with the old listener put back (expected 1 shot, got 0).
   - **Proved in Chrome:** a real click killed an enemy and the score went up in `1`, `2` and `B`.
2. **Single-player tier intro.**
   - **What changed:** modes `1` and `2` show one large character, the tier name and the boss's name; `B` keeps the VS screen.
   - **Proved in Chrome:** switching mode during the intro swapped it.
3. **Boss rebuilt.**
   - **Head:** a chunky angry head with horns and teeth.
   - **Part-windows:** in columns either side of the main window. Each shows a number badge, the part's name in big type, and the tool that beats it.
   - **Plaza:** no buildings around the boss, so no building can hide a part.
   - **Camera:** over the shoulder. The camera stands just behind the character, so they're big in the foreground. The boss stands far enough away to fit the band between the HUD and the character's head.
   - **HUD:** during the fight the caption and tool tray dock right, and the split-screen boss bar is slimmer.
   - **Layout test:** a pure layout function, `bosslayout.ts`, is checked for overlaps with 0 to 8 parts.
   - **Proved:** tiers 1–5 in `B` and `2`, at 1920×1080 through Playwright and in Chrome with real keys. Also tier 1 in `1` and `S`, played through to the result.
4. **Gate badges.**
   - **What changed:** `gatelabel.ts` turns "G01 · Formatting" into a badge (1) and a title (Formatting). It's used in the top bar, the banner, the 3D gate signs, the tray, the tool card, the presenter notes and the progress line. Tier ranges read "Gates 0–2".
   - **Test:** a unit test covers the label and checks that no gate in the content file keeps a G code.
5. **Realistic autoplay.**
   - **Behaviour:** `autogunner.ts` is a seeded hand. The aim drifts onto a target, the pauses vary, about one shot in five is pulled wide, and it sometimes fires 2–4 shot bursts. A shot goes where the hand points, so a miss really misses.
   - **Controls:** it's a top-bar button as well as `A`.
   - **Per player:** each has their own seed and a visible reticle of their own.
   - **Test:** a unit test with a fixed seed.
   - **Proved in Chrome:** both players fired during the same walk in `B`.
6. **Mode `S` (you vs autopilot).**
   - **What changed:** split screen, with player 1 always on autoplay and the mouse playing player 2 only. There's a fourth button on the title screen and `S` in the top-bar chip.
   - **Proved in Chrome:** the autopilot fired by itself while 5 real clicks killed player 2's robot.
7. **What you miss becomes debt.**
   - **What changed:** an enemy that slips past player 1 adds to BUGS SHIPPED, which is also on the result screen. One that slips past player 2 shows a CAUGHT BY CI pop and isn't counted.
   - **Health:** unchanged. A unit test checks every step against `src/show/health.baseline.json`, which was recorded from the code before the change.
8. **Clicker keys.**
   - **What changed:** `Space`, `→` and `Page Down` are "next", and `Page Up` is "back"; no key fires. Clicked buttons now drop their focus, so `Space` can't press them again. The presenter window takes `Page Down` and `Page Up` too.
   - **Proved in Chrome:** `Space` during a walk moved the show on with the shot counts unchanged.

Not done, or worth knowing:

- **Player 2's health dip:** player 2 still dips when the boss arrives (flagged after iteration 1). The prompt said to leave health exactly as it was.
- **Bugs shipped:** the counter adds up across tiers, the same way the score does.
- **Chrome window size:** on Roamy the page is zoomed to 125% and the tools can't reset it, so Chrome's window was 1440×790. The 1920×1080 boss screenshots come from Playwright.
- **Console errors:** none in the part of the run Claude in Chrome watched, but it only started watching late in the run. The Playwright suite checks the console on every run.
- **Small additions:** split-screen lanes now show the score, and long tool names are trimmed on the boss parts (the tray shows them in full).
- **Dev server:** the one started at 20:35 the night before was left running and served the whole run.
