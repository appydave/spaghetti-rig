import type { AppContext, Screen } from "#root/src/app/context.ts";
import { installErrorBanner, showError } from "#root/src/app/errors.ts";
import { clickAction } from "#root/src/app/boot/clicks.ts";
import { tierCards } from "#root/src/app/boot/map.ts";
import { installKeys, key } from "#root/src/app/keys.ts";
import { presenter } from "#root/src/app/presenter.ts";
import { AudioEngine, MS_PER_SECOND, TRACKS } from "#root/src/audio/audio.ts";
import { loadContent } from "#root/src/content/load.ts";
import { byId, closestEl, queryAllEl } from "#root/src/dom.ts";
import { Director, SPLIT_PAN } from "#root/src/show/director.ts";
import { SCORE_DIGITS } from "#root/src/show/director/shared.ts";
import {
  isSplit,
  MODES,
  modeInfo,
  type Mode,
  type Player,
} from "#root/src/content/script.ts";
import { initPhysics } from "#root/src/world/combat/physics.ts";
import { Stage } from "#root/src/world/stage.ts";
import type { TestHooks } from "#root/src/testhooks.ts";
import { PlayerWorld } from "#root/src/world/world.ts";

const $ = (id: string) => byId(id, HTMLElement);

/** A slow frame advances the game by at most this many seconds, so a stalled tab does not jump. */
const MAX_FRAME_SECONDS = 0.05;

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(`spaghetti-rig:${k}`);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(`spaghetti-rig:${k}`, v);
    } catch {
      /* private mode */
    }
  },
};

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
  const audio = new AudioEngine();
  const stage = new Stage(byId("stage", HTMLCanvasElement));
  let mode: Mode =
    MODES.find((m) => m.mode === store.get("mode"))?.mode ?? "both";
  const pan = (p: Player) => (): number =>
    isSplit(mode) ? (p === "p1" ? -SPLIT_PAN : SPLIT_PAN) : 0;
  const worlds = {
    p1: new PlayerWorld("p1", game, audio, pan("p1")),
    p2: new PlayerWorld("p2", game, audio, pan("p2")),
  };

  stage.setMode(mode);
  stage.attach(worlds);

  const director = new Director({ game, stage, worlds, audio }, mode);
  let screen: Screen = "prelude";
  let selected = Math.max(
    0,
    game.tiers.findIndex((t) => t.playable),
  );
  let best = Number(store.get("best") ?? 0);

  // Words from the content file.
  const words = game.content.screens.title.big.trim().split(/\s+/);

  $("title-1").textContent = (
    words.slice(0, -1).join(" ") ||
    words[0] ||
    ""
  ).toUpperCase();
  $("title-2-word").textContent = (words.slice(1).at(-1) ?? "").toUpperCase();
  $("tagline").textContent = game.content.screens.title.sub;
  document.title = game.content.screens.title.big;
  $("best").textContent = String(best).padStart(SCORE_DIGITS, "0");
  $("track-list").textContent =
    `Soundtrack: ${TRACKS.map((t) => t.name).join(", ")}.`;
  director.onScore = (s) => {
    if (s > best) {
      best = s;
      store.set("best", String(s));
      $("best").textContent = String(best).padStart(SCORE_DIGITS, "0");
    }
  };

  director.onExit = () => show("map");

  audio.onTrackChange((name) => {
    const s = name ? `♫ ${name}` : "♫ —";

    $("now-playing").textContent = s;
    $("title-track").textContent =
      `${s} · ${audio.muted ? "SOUND OFF" : "SOUND ON"}`;
  });

  function setMode(m: Mode) {
    mode = m;
    store.set("mode", m);
    director.setMode(m);
    for (const b of queryAllEl(document, "[data-mode]")) {
      b.setAttribute("aria-checked", String(b.dataset.mode === m));
    }

    $("map-mode").textContent = modeInfo(m).map;
    audio.play("uiMove");
  }

  function renderMap() {
    const list = $("tiers");

    list.style.setProperty("--n", String(game.tiers.length));
    list.innerHTML = tierCards(game.tiers, selected);
  }

  function show(s: Screen) {
    screen = s;
    $("prelude").hidden = s !== "prelude";
    $("title").hidden = s !== "title";
    $("map").hidden = s !== "map";
    $("game").hidden = s !== "game";
    director.active = s === "game";
    if (s === "title") {
      stage.view = "title";
      audio.setTheme("title");
      backdrop.className = "menu";
    }

    if (s === "map") {
      stage.view = "none";
      renderMap();
      audio.setTheme("title");
      backdrop.className = "menu";
    }

    if (s !== "game") {
      $("notes").hidden = true;
      document.body.dataset.phase = s;
    }

    if (s === "game") {
      backdrop.className = "";
    }
  }

  function start(tierIndex: number) {
    const t = game.tiers[tierIndex];

    if (!t?.playable) {
      audio.play("bounce");

      return;
    }

    audio.play("uiSelect");
    show("game");
    director.startTier(tierIndex);
  }

  function togglePause() {
    if (screen !== "game") {
      return;
    }

    director.setPaused(!director.paused);
  }

  function toggleMute() {
    audio.muted = !audio.muted;
    document.body.classList.toggle("muted", audio.muted);
    for (const e of document.querySelectorAll(".sound-label")) {
      e.textContent = audio.muted ? "SOUND OFF" : "SOUND ON";
    }
  }

  function toggleHelp() {
    const h = $("help");

    h.hidden = !h.hidden;
    if (!h.hidden && screen === "game" && !director.paused) {
      director.setPaused(true);
    }
  }

  async function enter() {
    await audio.unlock();
    show("title");
    setMode(mode);
    $("start").focus();
  }

  $("enter").addEventListener("click", () => void enter());
  $("start").addEventListener("click", () => {
    show("map");
    audio.play("uiSelect");
  });
  for (const b of queryAllEl(document, "[data-mode]")) {
    b.addEventListener("click", () => {
      const mode = MODES.find((x) => x.mode === b.dataset.mode);

      if (!mode) {
        throw new Error(`Unknown mode "${b.dataset.mode}"`);
      }

      setMode(mode.mode);
      b.blur();
    });
  }

  $("tiers").addEventListener("click", (e) => {
    const li = closestEl(e.target, ".tier");

    if (!li) {
      return;
    }

    const i = Number(li.dataset.i);

    if (i === selected) {
      start(i);
    } else {
      selected = i;
      renderMap();
      audio.play("uiMove");
    }
  });

  const ctx: AppContext = {
    get screen() {
      return screen;
    },
    get selected() {
      return selected;
    },
    set selected(v: number) {
      selected = v;
    },
    tiers: game.tiers,
    director,
    audio,
    helpOpen: () => !$("help").hidden,
    closeHelp: () => {
      $("help").hidden = true;
    },
    show,
    start,
    enter,
    toggleMute,
    toggleHelp,
    togglePause,
    setMode,
    renderMap,
  };

  document.addEventListener("click", (e) => {
    const a = closestEl(e.target, "[data-action]");

    if (!a) {
      return;
    }

    clickAction(ctx, a.dataset.action);

    // A clicked button keeps focus; let it go, so Space stays "next" and never presses it again.
    if (a instanceof HTMLButtonElement) {
      a.blur();
    }
  });
  installKeys(ctx);

  // Frame loop.
  let last = performance.now();

  function frame(now: number) {
    const dt = Math.min(MAX_FRAME_SECONDS, (now - last) / MS_PER_SECOND);

    last = now;
    director.update(dt);
    stage.render(director.paused && screen === "game" ? 0 : dt);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  stage.canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    showError("Graphics context lost — reload the page.");
  });

  // Hooks for the browser tests (dev builds only).
  if (import.meta.env.DEV) {
    const rig = {
      game,
      director,
      worlds,
      stage,
      audio,
      show,
      start,
      key: (code: string, shift: boolean, k: string) =>
        key(ctx, code, shift, k),
      get screen() {
        return screen;
      },
    };

    Object.assign(window, { __rig: rig satisfies TestHooks });
  }

  show("prelude");
  $("enter").focus();
}

export type { Game } from "#root/src/content/load.ts";
