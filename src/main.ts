import { AudioEngine, TRACKS } from "./audio/audio";
import { loadContent } from "./content/load";
import { byId, closestEl, queryAllEl } from "./dom";
import { Director, SCORE_DIGITS, SPLIT_PAN } from "./show/director";
import { parsePresenterState } from "./show/messages";
import {
  isSplit,
  MODES,
  modeInfo,
  type Mode,
  type Player,
} from "./show/script";
import { gatesText } from "./content/gatelabel";
import { esc } from "./ui/card";
import { initPhysics } from "./world/physics";
import { Stage } from "./world/stage";
import type { TestHooks } from "./testhooks";
import { PlayerWorld } from "./world/world";

const $ = (id: string) => byId(id, HTMLElement);

/** An error message stays on screen this long. */
const ERROR_TOAST_MS = 8000;
const MS_PER_SECOND = 1000;
/** A slow frame advances the game by at most this many seconds, so a stalled tab does not jump. */
const MAX_FRAME_SECONDS = 0.05;

type Screen = "prelude" | "title" | "map" | "game";

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

function showError(message: string, cause?: unknown) {
  console.error(cause ?? message);

  const el = document.createElement("div");

  el.className = "error";
  el.textContent = `Something broke: ${message}`;
  document.body.append(el);
  setTimeout(() => el.remove(), ERROR_TOAST_MS);
}

addEventListener("error", (e) =>
  showError(e.error instanceof Error ? e.error.message : e.message, e.error),
);
addEventListener("unhandledrejection", (e) =>
  showError(
    e.reason instanceof Error ? e.reason.message : String(e.reason),
    e.reason,
  ),
);

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

  const director = new Director(game, stage, worlds, audio, mode);
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
    list.innerHTML = game.tiers
      .map((t, i) => {
        const art = t.playable
          ? `/assets/tiers/${t.key}.svg`
          : `/assets/bosses/${t.key}.svg`;
        const fallback = t.playable
          ? "/assets/tiers/generic.svg"
          : "/assets/bosses/generic.svg";

        return `<li class="tier${t.playable ? "" : " locked"}${i === selected ? " sel" : ""}" data-i="${i}">
        ${t.playable ? "" : '<span class="lock">LOCKED</span>'}
        <span class="n">${String(t.n).padStart(2, "0")}</span>
        <img class="${t.playable ? "" : "boss-shadow"}" src="${art}" alt="" onerror="this.onerror=null;this.src='${fallback}'">
        <h3>${esc(t.name)}</h3>
        <span class="meta">${esc(gatesText(t.gates))} · ${t.stops.length} STOP${t.stops.length === 1 ? "" : "S"}</span>
        <p>${esc(t.idea ?? "")}</p>
        <div class="boss"><span class="label">BOSS</span><b>${esc(t.boss.name)}</b></div>
        ${t.playable && i === selected ? '<span class="primary-button go">ENTER · PLAY ↗</span>' : ""}
      </li>`;
      })
      .join("");
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

  document.addEventListener("click", (e) => {
    const a = closestEl(e.target, "[data-action]");

    if (!a) {
      return;
    }

    const act = a.dataset.action;

    if (act === "mute") {
      toggleMute();
    }

    if (act === "pause") {
      if (!$("help").hidden) {
        $("help").hidden = true;
      }

      togglePause();
    }

    if (act === "help") {
      toggleHelp();
    }

    if (act === "to-map") {
      director.setPaused(false);
      show("map");
    }

    if (act === "auto") {
      director.toggleAutoplay();
      audio.play("uiMove");
    }

    // A clicked button keeps focus; let it go, so Space stays "next" and never presses it again.
    if (a instanceof HTMLButtonElement) {
      a.blur();
    }
  });
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

  /** Every key, so the whole show runs from the keyboard. */
  function key(code: string, shift: boolean, k: string) {
    if (screen === "prelude") {
      if (["Enter", "Space", "ArrowRight"].includes(code)) {
        void enter();
      }

      return;
    }

    const digit = /^Digit([1-9])$/.exec(code)?.[1];

    if (shift && digit) {
      const n = Number(digit);
      const t = game.tiers.find((x) => x.n === n) ?? game.tiers[n - 1];

      if (t) {
        selected = t.index;
        start(t.index);
      }

      return;
    }

    if (code === "KeyM") {
      return toggleMute();
    }

    if (code === "KeyH" || k === "?") {
      return toggleHelp();
    }

    const pick = MODES.find((m) => m.code === code);

    if (pick) {
      return setMode(pick.mode);
    }

    if (code === "Escape") {
      if (!$("help").hidden) {
        $("help").hidden = true;

        return;
      }

      if (screen === "game") {
        if (director.paused) {
          director.setPaused(false);
        }

        show("map");
      } else if (screen === "map") {
        show("title");
      }

      return;
    }

    if (screen === "title") {
      if (["Enter", "Space", "ArrowRight"].includes(code)) {
        show("map");
        audio.play("uiSelect");
      }

      return;
    }

    if (screen === "map") {
      if (code === "ArrowRight" || code === "ArrowLeft") {
        selected =
          (selected + (code === "ArrowRight" ? 1 : -1) + game.tiers.length) %
          game.tiers.length;
        renderMap();
        audio.play("uiMove");
      }

      if (code === "Enter" || code === "Space") {
        start(selected);
      }

      return;
    }

    // In the game.
    if (code === "KeyP") {
      return togglePause();
    }

    if (code === "KeyN") {
      director.toggleNotes();

      return;
    }

    if (code === "KeyA") {
      director.toggleAutoplay();
      audio.play("uiMove");

      return;
    }

    if (director.paused) {
      if (code === "Space" || code === "ArrowRight") {
        togglePause();
      }

      return;
    }

    if (
      code === "ArrowRight" ||
      code === "Space" ||
      code === "PageDown" ||
      code === "Enter"
    ) {
      director.next();
    }

    if (code === "ArrowLeft" || code === "PageUp") {
      director.back();
    }
  }

  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) {
      return;
    }

    if (
      [
        "Space",
        "ArrowRight",
        "ArrowLeft",
        "ArrowUp",
        "ArrowDown",
        "PageDown",
        "PageUp",
      ].includes(e.code)
    ) {
      e.preventDefault();
    }

    if (e.repeat && !["ArrowRight", "ArrowLeft"].includes(e.code)) {
      return;
    }

    key(e.code, e.shiftKey, e.key);
  });
  // The presenter window can drive the show too.
  addEventListener("rig-command", (e) => {
    if (!(e instanceof CustomEvent)) {
      return;
    }

    const k: unknown = e.detail;

    if (typeof k !== "string") {
      return;
    }

    const map = new Map<string, [string, boolean]>([
      ["next", ["ArrowRight", false]],
      ["back", ["ArrowLeft", false]],
      ["pause", ["KeyP", false]],
      ["p1", ["Digit1", false]],
      ["p2", ["Digit2", false]],
      ["both", ["KeyB", false]],
      ["spec", ["KeyS", false]],
      ["auto", ["KeyA", false]],
    ]);
    const m = map.get(k);

    if (m) {
      key(m[0], m[1], "");
    }
  });

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
      key,
      get screen() {
        return screen;
      },
    };

    Object.assign(window, { __rig: rig satisfies TestHooks });
  }

  show("prelude");
  $("enter").focus();
}

/** ?presenter: a second window that follows the game and shows the notes for the current card. */
function presenter() {
  document.body.classList.add("presenter-mode");

  const root = $("presenter");

  root.hidden = false;
  root.innerHTML =
    '<p class="status">Waiting for the game window… open the game in another window or tab.</p>';

  const ch = new BroadcastChannel("spaghetti-rig");
  const send = (key: string) => ch.postMessage({ type: "cmd", key });

  ch.postMessage({ type: "hello" });
  ch.addEventListener("message", (e) => {
    const s = parsePresenterState(e.data);

    if (!s) {
      return;
    }

    const n = s.notes;

    root.innerHTML = `
      <div class="top"><div><span class="status">STEP ${s.index + 1} / ${s.total} · ${esc(s.mode.toUpperCase())}${s.paused ? " · PAUSED" : ""}</span><br><b>${esc(n.heading)}</b></div>
        <div class="ctl"><button data-k="back">← Back</button><button data-k="next">Next →</button><button data-k="pause">Pause</button></div></div>
      <div class="status">${esc(s.label)}</div>
      <div class="say">${esc(n.say)}</div>
      ${n.presenter.length ? `<ul>${n.presenter.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
      ${n.extra.map((x) => `<h3>${esc(x.label.toUpperCase())}</h3><table>${x.rows.map((r) => `<tr>${r.map((c, i) => `<td>${i === 0 ? `<code>${esc(c)}</code>` : esc(c)}</td>`).join("")}</tr>`).join("")}</table>`).join("")}
      <p class="next">Next: ${esc(s.next)}</p>`;
  });
  root.addEventListener("click", (e) => {
    const k = e.target instanceof HTMLElement ? e.target.dataset.k : undefined;

    if (k) {
      send(k);
    }
  });
  addEventListener("keydown", (e) => {
    const k = new Map([
      ["ArrowRight", "next"],
      ["Space", "next"],
      ["PageDown", "next"],
      ["ArrowLeft", "back"],
      ["PageUp", "back"],
      ["KeyP", "pause"],
      ["Digit1", "p1"],
      ["Digit2", "p2"],
      ["KeyB", "both"],
      ["KeyS", "spec"],
      ["KeyA", "auto"],
    ]).get(e.code);

    if (k) {
      e.preventDefault();
      send(k);
    }
  });
}

export type { Game } from "./content/load";
