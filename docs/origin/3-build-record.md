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
