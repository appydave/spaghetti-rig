import type { Screen } from "#root/src/app/context.ts";
import { App } from "#root/src/app/boot/app.ts";
import { wireButtons } from "#root/src/app/boot/buttons.ts";
import { store } from "#root/src/app/boot/store.ts";
import { fillTitle, followTracks, showBest } from "#root/src/app/boot/title.ts";
import { installErrorBanner, showError } from "#root/src/app/errors.ts";
import { installKeys, key } from "#root/src/app/keys.ts";
import { presenter } from "#root/src/app/presenter.ts";
import { AudioEngine } from "#root/src/audio/audio.ts";
import { audioParts } from "#root/src/audio/engine/parts.ts";
import { MS_PER_SECOND } from "#root/src/audio/engine/sfx-player.ts";
import { loadContent } from "#root/src/content/load.ts";
import { byId } from "#root/src/dom.ts";
import { Director, SPLIT_PAN } from "#root/src/show/director.ts";
import {
  isSplit,
  MODES,
  type Mode,
  type Player,
} from "#root/src/content/script.ts";
import { initPhysics } from "#root/src/world/combat/physics.ts";
import { Stage } from "#root/src/world/stage.ts";
import type { TestHooks } from "#root/src/testhooks.ts";
import { PlayerWorld } from "#root/src/world/world.ts";
import { makeShowcases } from "#root/src/world/models/showcase.ts";

/** A slow frame advances the game by at most this many seconds, so a stalled tab does not jump. */
const MAX_FRAME_SECONDS = 0.05;

installErrorBanner();

if (new URLSearchParams(location.search).has("presenter")) {
  presenter();
} else {
  try {
    await boot();
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err), err);
  }
}

/** Run the frame loop: the director, then the stage, which stands still while the game is paused. */
function runFrames(app: App, director: Director, stage: Stage) {
  let last = performance.now();

  function frame(now: number) {
    const dt = Math.min(MAX_FRAME_SECONDS, (now - last) / MS_PER_SECOND);

    last = now;
    director.update(dt);
    stage.render(director.paused && app.screen === "game" ? 0 : dt);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  stage.canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    showError("Graphics context lost — reload the page.");
  });
}

/** Hooks for the browser tests (dev builds only). */
function installTestHooks(
  app: App,
  parts: Pick<TestHooks, "game" | "worlds" | "audio" | "director"> & {
    stage: Stage;
  },
) {
  const rig = {
    ...parts,
    show: (s: Screen) => app.show(s),
    start: (i: number) => app.start(i),
    key: (code: string, shift: boolean, k: string) => key(app, code, shift, k),
    get screen() {
      return app.screen;
    },
  };

  Object.assign(window, { __rig: rig satisfies TestHooks });
}

async function boot() {
  const backdrop = document.createElement("div");

  backdrop.id = "backdrop";
  document.body.prepend(backdrop);

  const [game] = await Promise.all([
    loadContent(),
    initPhysics(),
    document.fonts.load("italic 800 40px Barlow"),
    document.fonts.load("800 40px Barlow"),
    document.fonts.load("500 20px Space"),
  ]);
  const audio = new AudioEngine(audioParts());
  const { title, vs } = makeShowcases();
  const stage = new Stage(byId("stage", HTMLCanvasElement), title, vs);
  const mode: Mode =
    MODES.find((m) => m.mode === store.get("mode"))?.mode ?? "both";
  // Sounds pan by the app's current mode; nothing plays before the app is built (audio unlocks on the first click).
  const pan = (p: Player) => (): number =>
    isSplit(app.mode) ? (p === "p1" ? -SPLIT_PAN : SPLIT_PAN) : 0;
  const worlds = {
    p1: new PlayerWorld("p1", game, audio, pan("p1")),
    p2: new PlayerWorld("p2", game, audio, pan("p2")),
  };

  stage.setMode(mode);
  stage.attach(worlds);

  const director = new Director({ game, stage, worlds, audio }, mode);
  const app = new App({ game, audio, stage, director, backdrop, store }, mode);
  let best = Number(store.get("best") ?? 0);

  fillTitle(game, best);
  director.onScore = (s) => {
    if (s > best) {
      best = s;
      store.set("best", String(s));
      showBest(best);
    }
  };

  director.onExit = () => app.show("map");
  followTracks(audio);
  wireButtons(app);
  installKeys(app);
  runFrames(app, director, stage);
  if (import.meta.env.DEV) {
    installTestHooks(app, { game, worlds, stage, audio, director });
  }

  app.show("prelude");
  byId("enter", HTMLElement).focus();
}

export type { Game } from "#root/src/content/load.ts";
