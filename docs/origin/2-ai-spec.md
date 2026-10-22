> **Spaghetti Rig.** I want a 3D game for my laptop that I'll run live on stage at an engineers' meetup and record for YouTube. Build it in this folder.

## 2.1 What the game is

It's a **rail shooter** in the style of House of the Dead or Time Crisis. The game walks you down a street, **stops** you at points along the way, things happen at the stop, and then it walks you on.

The story: two developers walk the same road through six levels ("tiers"). At every stop a piece of bad code attacks them (the "problem card").
- **Player 1** is a vibe coder with no tools. Every attack hurts them, nothing heals them, and the boss at the end of each tier finishes them off.
- **Player 2** has a quality specialist's tools. At every stop they play a **tool card** that fixes the bad code and heals them, and they beat the boss.

The audience watches the two side by side and sees why the tools matter.

The game is a companion to an existing game I love, **Spaghetti Busters** by Omer Gilad (https://spaghetti-busters.vercel.app; its code is at `/Users/davidcruwys/dev/upstream/repos/spaghetti-busters-pregate-cce0b46`, with screenshots in `docs/screenshots/`). Ours is a different kind of game, but **it must look like it came from the same design studio** (§2.3). Make all the art, models, music and sound yourself in that style. Don't copy his files, except the two fonts (they're under the Open Font Licence; their licence files are in his `public/fonts/`).

## 2.2 Three ways to play

| Mode | Key | What you see |
|---|---|---|
| Player 1 only | `1` | full screen, player 1's run: hit at every stop, no tools, loses to the boss |
| Player 2 only | `2` | full screen, player 2's run: hit, plays the tool card, fully healed, beats the boss |
| Both, side by side | `B` | split screen, player 1 on the left and player 2 on the right, on the same road at the same moment. This is the main stage mode |

Switching mode mid-game keeps your place.

## 2.3 Style: the same studio as Spaghetti Busters

Study his screenshots (`menu.png`, `gameplay.png`, `boss.png`, `code-disintegration.png`, `prelude.png`) and play the live game. This is what to carry over.

**Mood.** A bright, friendly toy world with cheeky developer humour ("Clean code. Dirty work."). Soft daylight, pastel mint, chunky cartoon shapes. Light and airy, never dark or neon.

**Colours** (his values):

| Role | Colour |
|---|---|
| Ink (text, outlines, dark buttons) | `#173e35` |
| Mint (page and world) | `#d9eddd`, menu wash `#dfebd9`, game background `#dcead7` |
| Paper | `#f4f4e8` |
| Yellow (main buttons, highlights, banners) | `#f9db48` |
| Muted text | `#698074` |
| Focus ring | `#ed9757` |
| Sky / fog | `#b8d3c2` / `#c2d9c8` |
| Code windows: body / header / edge / side | `#122d40` / `#35556b` / `#8ebebf` / `#547e92` |
| Window dots | `#ff8b69`, `#ffd96a`, `#aee5a3` |
| Code colours: text / keyword / string / number / comment / punctuation | `#d6e2f0` / `#bd9bff` / `#b7e994` / `#ffbc79` / `#6889a6` / `#7da6c6` |
| Boss: body / header / edge / armour / glow | `#2f202a` / `#8b3329` / `#ffae59` / `#e85b2b` / `#ff6d21` |
| Danger / safe | `#de6a47` / `#8faf76` |
| Boss announcement text | `#97313c` on yellow |

**Fonts.**
- Barlow Condensed ExtraBold, upright and italic, for big titles and announcements: huge, slanted, tight.
- Space Grotesk Medium for everything else, with small spaced-out capitals for labels ("CLEANUP SCORE", "CURRENT WAVE").
- A monospace font for code.

**3D look.**
- A small mint toy city: rounded pastel buildings with window grids, lollipop trees, light paving.
- Cel-shaded (toon) materials, with ACES filmic tone mapping at exposure ~1.1.
- Lighting: a sky/ground hemisphere light, a warm sun (`#fff0c1`) casting soft shadows, and a cool blue rim light (`#93cfff`).
- Gentle fog in the distance.

**Characters.** Chunky, toy-like, slightly bobble-headed.
- **Player 2** is the code quality specialist: white suit, glasses, yellow tie, swept dark hair, and a mint-and-yellow cannon.
- **Player 1** is the vibe coder, in the same style: give them their own look (hoodie, headphones, a laptop, whatever reads instantly as "ships fast, never checks").
- Everything should feel like it belongs in his world, including his AI robot enemies.

**Code as objects.**
- Code appears as chunky 3D editor windows: a title bar with a filename and the three coloured dots, syntax-coloured code, and thick slab edges.
- When code is fixed or destroyed it cracks and breaks into physical pieces, as in his `code-disintegration.png`.
- Angry code has a red title bar and angry eyes.

**HUD.**
- Top-left: the logo (curly braces around a lightning bolt) and the game name.
- Small capital labels over big numbers.
- Round outlined buttons for sound and pause.
- Bottom: cards with a key number in the corner.
- Main buttons are flat yellow with an ink border and an orange focus ring.

**Title screen.**
- An illustrated hero scene: the specialist with the cannon, floating code windows, comic bursts, and a "TECH DEBT DETECTED" sticker.
- A giant slanted two-line title with an ink line and a yellow line.
- A one-line tagline, a yellow start button, a How to Play link, a best score, and a thin mission strip along the bottom.
- Before it, a **"Click to play" prelude** over a soft, washed-out circuit-board picture. The click also starts the audio.

**Announcements.** A full-width yellow banner, with a small spaced label on top ("PRODUCTION INCIDENT") and a huge italic two-colour headline ("Boss fight — FactoryFactoryFactory is pushed to main!").

**Music and sound.**
- All made live in the browser with the Web Audio API: chord pads, a triangle or sine lead, arpeggios, 110–145 bpm, and several named tracks (his are "Prism Circuit", "Midnight Refactor", "Glass Gardens", "Zero Gravity").
- A title theme, a walking theme, a tense stop theme and a boss theme.
- A sound for every event: hit, card flies in, card played, code fixed, heal, boss arrives, win, lose. Show the "now playing" track name small in a corner, like his.
- Make our own tracks in the same spirit.

**Effects.** Muzzle flashes, sparks, rings, screen shake on hits, cracking glass on code windows, and debris that bounces with real physics.

## 2.4 The mechanic at each stop (do it exactly like this)

1. **The problem card hits both players.**
   - It is the gate's bad code as it really looks. For the formatting stop, that's badly indented code with missing line breaks or braces.
   - It shows as an angry code window that slams into each player.
   - Mark the problem lines like an editor does: a red squiggle under each problem, with its short note.
   - Each player takes damage (see health below).
2. **Only player 2 then plays a tool card.**
   - It's styled like a Dungeons & Dragons or Magic: The Gathering card: a frame, a name, a picture, a type line ("Tool · Tier 1 Foundation"), rules text, and a power box.
   - It **flies in as an overlay over player 2's half and never appears for player 1.**
   - The card face shows the **real configuration being applied**. For Prettier, that's the `package.json` change and the step added to the CI workflow file, or whatever configuration the content file holds for that tool.
   - Once it's played, **player 2's code visibly changes into the fixed version.** Show it as a diff: red strike-through on removed lines, a green box on added ones. Player 2's health goes back to 100%.
3. **Player 1 never gets a tool card or any health back.**

**Health.**
- Both players start each tier at 100%.
- Each problem-card hit takes 90% divided by the number of stops in that tier. In a three-stop tier, that's 30%, so player 1 goes 100 → 70 → 40 → 10%.
- Player 1 reaches the boss on 10%, and the boss finishes them quickly.
- Player 2 drops at every hit and is restored to 100% by every tool card, then beats the boss.

**The boss** (one per tier) is a giant angry code window made of the tier's problems. The content file lists its parts and which tool beats each part.
- Player 2 shoots each part with the tool card they earned at that stop. The tools are their weapons, and each part breaks apart when hit.
- Player 1 has nothing that works: their shots bounce off.
- Use the boss's lines from the content file for what each side sees.

**Between stops** the road is the fun bit: spaghetti, stray bugs and AI robots to shoot for score. You aim and shoot with the mouse, like his game. There's also an **autoplay** (`A`) that shoots by itself, because on stage I'm talking and pressing `→`, not aiming.

## 2.5 Screens, in order

1. **Prelude:** "Click to play". This starts the audio.
2. **Title:** as in §2.3. Shows the mode choice (`1` / `2` / `B`).
3. **Tier map:** six tiers in a row. The ones with content can be played; the others are locked and show their boss's name.
4. **VS screen, per tier:** Street Fighter style, a few seconds long. The two characters face each other, with the tier name and "Vibe-coded · no gates VS Gated" from the content file.
5. **Walk:** the camera follows the player(s) down the road; shoot things.
6. **Stop at a gate:** the gate's name comes up as a banner (for example "G01 · Formatting").
7. **Problem card:** §2.4 step 1.
8. **Tool card**, player 2 only: §2.4 step 2. Then walk on to the next stop.
9. **Boss:** a yellow banner announcement, then the fight (§2.4). Show its health bar in red.
10. **Tier result:** player 1 down, player 2 standing. On to the next tier's VS screen.
11. **Ending:** two endings from the content file. Player 1 gets "Buried in spaghetti"; player 2 gets "Shipped". In both mode, show both, side by side.

**Keys.**

| Key | Does |
|---|---|
| `→` or Space | next (walk on, play the card, skip a pause) |
| `←` | back one step |
| `1` / `2` / `B` | player 1 / player 2 / both |
| `Shift+1` … `Shift+6` | jump to that tier |
| `A` | autoplay on/off |
| `M` | mute |
| `P` | pause |
| `N` | speaker notes on/off (below) |

The whole show must be runnable from the keyboard alone.

**Speaker notes.**
- Every card in the content file has `say` (one line I say out loud) and `presenter` notes. `N` shows them small, on a strip at the bottom.
- Better still, open a second window at `?presenter` that shows the notes for the current card and follows the game. Then I can keep it on my laptop screen while the projector shows the game.

## 2.6 Content: the game's words and code come from a file

All card content comes from **`public/content/cards.json`**. Copy it once from `/Users/davidcruwys/dev/upstream/repos/spaghetti-rig-inputs/cards.json`, and never edit the original.

The game loads it at start. It holds:
- the title and VS text;
- six tiers with their bosses;
- the stops, each with a player 1 problem card and a player 2 tool card;
- the tools with their real configuration lines;
- the two endings;
- how to mark the code: `problem` = red squiggle (red strike in a diff), `fix` = green box, `note` = amber underline, `number` = amber box.

A **stop** is a gate. Its `p1` is the problem card, its `p2` the tool card, and `p2.tool` names the tool in `tools`. Code blocks come in three views: plain code, diff (`a` added, `d` removed, `l` file label) and tool output.

**When I add a stop or a tier to the file, it must show up after a reload, with no change to the game.** Tiers with no stops yet are locked.

For the look and feel of the cards, see my lo-fi prototype, `/Users/davidcruwys/dev/upstream/repos/spaghetti-rig-inputs/lofi-demo.html` (it reads the same file). For the game idea, see `/Users/davidcruwys/dev/upstream/repos/spaghetti-rig-inputs/game-forms.html`. Both are rough sketches. Make the real thing much better.

> **Important:** the cards are *about* tools like Prettier, ESLint/lint, CI (GitHub Actions) and other code checkers. All of that is **text and configuration the game displays**. It is not a to-do list for this game's own code. Do not add Prettier, a linter, CI, or any other tool or check to this project because a card mentions it.

## 2.7 Technology

- **Only these:** Vite, TypeScript and three.js. Add a physics library if the debris needs one, as his game does. For testing, Vitest and Playwright.
- **Please test it** so it actually works: the game must not break as I play through it.
- **It runs on my laptop, offline** (meetup Wi-Fi can't be trusted). After `npm install`, everything it needs is in this folder: fonts, models, sounds. No CDNs, no online services, no accounts.
- `npm run dev` starts it.

## 2.8 How finished it should be

At least as complete as Spaghetti Busters:
- the prelude and an illustrated title screen with music;
- several music tracks and a sound for everything;
- a real 3D world with lighting and shadows;
- proper characters and enemies;
- code that cracks and breaks apart;
- bosses with announcements;
- a HUD with score, sound and pause;
- How to Play;
- tested.

I'll be showing it to a room of engineers, on a big screen, so everything must be readable from the back of the room.

Build me a fucking good game.
