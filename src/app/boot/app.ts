// The running app, as boot builds it once: which screen is up, the tier choice, the mode, the best score, and the actions the keys and
// buttons call. Moved out of main.ts's boot(), where these were local variables and nested functions.
import type { AppContext, Screen } from "#root/src/app/context.ts";
import { tierCards } from "#root/src/app/boot/map.ts";
import type { Store } from "#root/src/app/boot/store.ts";
import type { AudioEngine } from "#root/src/audio/audio.ts";
import type { Game } from "#root/src/content/load.ts";
import { modeInfo, type Mode } from "#root/src/content/script.ts";
import type { Director } from "#root/src/show/director.ts";
import { byId, queryAllEl } from "#root/src/dom.ts";
import type { Stage } from "#root/src/world/stage.ts";

const $ = (id: string) => byId(id, HTMLElement);

/** What the app asks of the director and the audio engine. */
export type AppDirector = AppContext["director"] &
  Pick<Director, "active" | "setMode" | "startTier">;
export type AppAudio = Pick<
  AudioEngine,
  "play" | "setTheme" | "muted" | "unlock"
>;

/** What the app is built from. */
export interface AppParts {
  game: Pick<Game, "tiers">;
  audio: AppAudio;
  stage: Pick<Stage, "view">;
  director: AppDirector;
  backdrop: HTMLElement;
  store: Store;
}

export class App implements AppContext {
  screen: Screen = "prelude";
  selected: number;
  readonly tiers: Game["tiers"];
  readonly director: AppDirector;
  readonly audio: AppAudio;

  constructor(
    private readonly parts: AppParts,
    public mode: Mode,
  ) {
    this.tiers = parts.game.tiers;
    this.director = parts.director;
    this.audio = parts.audio;
    this.selected = Math.max(
      0,
      this.tiers.findIndex((t) => t.playable),
    );
  }

  helpOpen() {
    return !$("help").hidden;
  }

  closeHelp() {
    $("help").hidden = true;
  }

  setMode(m: Mode) {
    this.mode = m;
    this.parts.store.set("mode", m);
    this.director.setMode(m);
    for (const b of queryAllEl(document, "[data-mode]")) {
      b.setAttribute("aria-checked", String(b.dataset.mode === m));
    }

    $("map-mode").textContent = modeInfo(m).map;
    this.audio.play("uiMove");
  }

  renderMap() {
    const list = $("tiers");

    list.style.setProperty("--n", String(this.tiers.length));
    list.innerHTML = tierCards(this.tiers, this.selected);
  }

  show(s: Screen) {
    const { stage, backdrop } = this.parts;

    this.screen = s;
    $("prelude").hidden = s !== "prelude";
    $("title").hidden = s !== "title";
    $("map").hidden = s !== "map";
    $("game").hidden = s !== "game";
    this.director.active = s === "game";
    if (s === "title") {
      stage.view = "title";
      this.audio.setTheme("title");
      backdrop.className = "menu";
    }

    if (s === "map") {
      stage.view = "none";
      this.renderMap();
      this.audio.setTheme("title");
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

  start(tierIndex: number) {
    const t = this.tiers[tierIndex];

    if (!t?.playable) {
      this.audio.play("bounce");

      return;
    }

    this.audio.play("uiSelect");
    this.show("game");
    this.director.startTier(tierIndex);
  }

  togglePause() {
    if (this.screen !== "game") {
      return;
    }

    this.director.setPaused(!this.director.paused);
  }

  toggleMute() {
    this.audio.muted = !this.audio.muted;
    document.body.classList.toggle("muted", this.audio.muted);
    for (const e of document.querySelectorAll(".sound-label")) {
      e.textContent = this.audio.muted ? "SOUND OFF" : "SOUND ON";
    }
  }

  toggleHelp() {
    const h = $("help");

    h.hidden = !h.hidden;
    if (!h.hidden && this.screen === "game" && !this.director.paused) {
      this.director.setPaused(true);
    }
  }

  async enter() {
    await this.audio.unlock();
    this.show("title");
    this.setMode(this.mode);
    $("start").focus();
  }
}
