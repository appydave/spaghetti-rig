# Spaghetti Rig

**Walk the gates. Shoot to learn.** A 3D rail shooter for the stage: two developers walk the same road through six tiers. At every gate a piece of real bad code slams into both of them. Player 1, a vibe coder with no tools, keeps every hit and is finished off by the boss. Player 2, a code quality specialist, plays a tool card that fixes the code and heals to 100%, then breaks the boss with the tools earned on the way.

A companion to Omer Gilad's [Spaghetti Busters](https://spaghetti-busters.vercel.app), made to look like it came from the same studio.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

Everything is local (fonts, art, music, physics). No network needed after `npm install`.

## Keys (the whole show runs from the keyboard)

| Key | Does |
|---|---|
| `→` / `Space` / `Page Down` | Next: walk on, play the card, skip a pause. Keys never shoot, so a presentation clicker is safe. |
| `←` / `Page Up` | Back one step |
| `1` / `2` / `B` | Player 1 / Player 2 / both side by side (keeps your place) |
| `S` | Side by side: you play the specialist (player 2), the vibe coder plays itself (keeps your place) |
| `Shift+1` … `Shift+6` | Jump to a tier |
| `A` | Autoplay on / off (or click its button in the top bar). It aims, misses and fires in bursts like a person; each player has their own hand. |
| `M` / `P` | Mute / pause |
| `N` | Speaker notes strip |
| `H` | How to play |
| `Esc` | Close / back to the map |
| Mouse / trackpad | Aim, then click, press or tap to shoot spaghetti, bugs and AI robots |

**Presenter view:** open `http://localhost:5173/?presenter` in a second window. It follows the game, shows the card's `say` line, presenter notes, the tool's config and evidence, and its arrow keys and buttons drive the game too.

## Content

All words and code come from `public/content/cards.json` (copied once from `spaghetti-rig-inputs`). Add a stop or a tier and reload: it appears with no code change. Tiers with no stops are locked on the map and show their boss. Tool card pictures are `public/assets/tools/<tool key>.svg`; a tool without one uses `generic.svg`.

## Tests

```sh
npm test           # Vitest: content parsing, the show script, health maths (unchanged since iteration 1), gate labels, boss layout, autoplay's aim and timing
npm run test:e2e   # Playwright: full keyboard playthrough, real mouse presses in every mode, Space/Page Down/Page Up, autoplay, mode S, bugs shipped, tier intros, gate badges
```

## Project

- `src/content/`: loads and normalises `cards.json`.
- `src/show/script.ts`: the show as a flat list of steps. Health, tools earned and notes are pure functions of the step, so back, jumps and mode switches always land in the same place.
- `src/show/director.ts`: runs the steps, keeps both players in lockstep, HUD, cards, banners, presenter sync.
- Missed enemies are debt, not damage: one that gets past player 1 adds to **bugs shipped**; one that gets past player 2 is **caught by CI**. Health never changes for a miss.
- `src/world/`: three.js. `world.ts` is one player's street (two are rendered side by side with the scissor), `codewindow.ts` paints editor windows and shatters them into Rapier physics pieces, `characters.ts`, `enemies.ts`, `boss.ts`, `city.ts`, `gate.ts`, `effects.ts`, `showcase.ts` (title hero and VS).
- `src/audio/`: Web Audio synth music (9 original tracks) and every sound effect.
- `public/assets/`: original SVG art (see `ASSETS.md`). Fonts: Barlow Condensed and Space Grotesk under the SIL Open Font Licence (`public/fonts/`).
