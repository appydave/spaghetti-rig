// @vitest-environment happy-dom
// The app boot builds, on the real page: which screens show, the tier choice, the mode buttons, pause, mute and help, and the title's words.
import { beforeEach, describe, expect, it } from "vitest";
import {
  App,
  type AppAudio,
  type AppDirector,
} from "#root/src/app/boot/app.ts";
import { wireButtons } from "#root/src/app/boot/buttons.ts";
import { store } from "#root/src/app/boot/store.ts";
import { fillTitle, followTracks, showBest } from "#root/src/app/boot/title.ts";
import { TRACKS } from "#root/src/audio/audio.ts";
import type { Mode } from "#root/src/show/script.ts";
import type { Stage } from "#root/src/world/stage.ts";
import { pageBody } from "#root/lint/gates/director-dom.ts";
import { game } from "#root/lint/gates/director-show.ts";

const log: string[] = [];
const el = (id: string) => document.getElementById(id) as HTMLElement;

const director: AppDirector = {
  active: false,
  paused: false,
  setPaused(p: boolean) {
    this.paused = p;
    log.push(`paused:${p}`);
  },
  toggleNotes: () => void log.push("notes"),
  toggleAutoplay: () => void log.push("auto"),
  next: () => void log.push("next"),
  back: () => void log.push("back"),
  setMode: (m: Mode) => void log.push(`mode:${m}`),
  startTier: (i: number) => void log.push(`startTier:${i}`),
};
const audio: AppAudio = {
  muted: false,
  play: (name) => void log.push(`play:${name}`),
  setTheme: (t) => void log.push(`theme:${t}`),
  unlock: async () => void log.push("unlock"),
};
const stage: Pick<Stage, "view"> = { view: "none" };

function freshApp(): App {
  document.body.innerHTML = pageBody();
  log.length = 0;
  director.paused = false;
  audio.muted = false;

  const backdrop = el("backdrop");

  return new App({ game, audio, stage, director, backdrop, store }, "both");
}

let app: App;

beforeEach(() => {
  app = freshApp();
});

describe("screens", () => {
  it("one screen shows at a time; the map draws the tiers and the game lifts the menu backdrop", () => {
    app.show("map");
    expect(el("map").hidden).toBe(false);
    expect(el("title").hidden).toBe(true);
    expect(el("tiers").querySelectorAll("li")).toHaveLength(game.tiers.length);
    expect(el("backdrop").className).toBe("menu");
    expect(document.body.dataset.phase).toBe("map");
    expect(log).toContain("theme:title");
    app.show("game");
    expect(director.active).toBe(true);
    expect(el("game").hidden).toBe(false);
    expect(el("backdrop").className).toBe("");
  });

  it("the title screen shows the title stage; entering unlocks sound and sets the mode", async () => {
    await app.enter();
    expect(app.screen).toBe("title");
    expect(stage.view).toBe("title");
    expect(log.slice(0, 3)).toEqual(["unlock", "theme:title", "mode:both"]);
    expect(el("map-mode").textContent).toContain("BOTH");
  });

  it("the first playable tier is chosen; a locked tier bounces, a playable one starts", () => {
    expect(app.selected).toBe(game.tiers.findIndex((t) => t.playable));
    app.start(game.tiers.length + 5);
    expect(log).toEqual(["play:bounce"]);
    app.start(0);
    expect(log).toEqual(["play:bounce", "play:uiSelect", "startTier:0"]);
    expect(app.screen).toBe("game");
  });
});

describe("toggles", () => {
  it("pause works only in the game", () => {
    app.togglePause();
    expect(log).toEqual([]);
    app.show("game");
    app.togglePause();
    expect(director.paused).toBe(true);
  });

  it("mute flips the sound labels and the body class", () => {
    app.toggleMute();
    expect(audio.muted).toBe(true);
    expect(document.body.classList.contains("muted")).toBe(true);
    expect(document.querySelector(".sound-label")?.textContent).toBe(
      "SOUND OFF",
    );
  });

  it("help opens over the game and pauses it; closing it does not unpause", () => {
    app.show("game");
    app.toggleHelp();
    expect(app.helpOpen()).toBe(true);
    expect(director.paused).toBe(true);
    app.closeHelp();
    expect(app.helpOpen()).toBe(false);
    expect(director.paused).toBe(true);
  });

  it("a mode is saved, sent to the director and checked on its button", () => {
    app.setMode("p2");
    expect(store.get("mode")).toBe("p2");
    expect(log).toEqual(["mode:p2", "play:uiMove"]);
    expect(
      document.querySelector("[data-mode='p2']")?.getAttribute("aria-checked"),
    ).toBe("true");
  });
});

describe("buttons", () => {
  beforeEach(() => wireButtons(app));

  const click = (target: Element | null) =>
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  it("start opens the map; a mode button sets the mode", () => {
    click(el("start"));
    expect(app.screen).toBe("map");
    click(document.querySelector("[data-mode='p1']"));
    expect(app.mode).toBe("p1");
  });

  it("a tier click chooses it, a second click starts it", () => {
    app.show("map");
    log.length = 0;
    click(el("tiers").querySelector("[data-i='1']"));
    expect(app.selected).toBe(1);
    click(el("tiers").querySelector("[data-i='1']"));
    expect(log).toContain("startTier:1");
    click(el("tiers"));
  });

  it("an action button runs its action", () => {
    click(document.querySelector("[data-action='auto']"));
    expect(log).toContain("auto");
    click(document.body);
  });
});

describe("the title", () => {
  it("splits the title over two lines and shows the best score and the soundtrack", () => {
    fillTitle(game, 42);
    expect(el("title-1").textContent).toBe(
      el("title-1").textContent?.toUpperCase(),
    );
    expect(el("tagline").textContent).toBe(game.content.screens.title.sub);
    expect(el("best").textContent).toMatch(/^0+42$/);
    expect(el("track-list").textContent).toContain(TRACKS[0]?.name);
    showBest(7);
    expect(el("best").textContent).toMatch(/^0+7$/);
  });

  it("the now-playing labels follow the track", () => {
    let listener: (name: string) => void = () => {};

    followTracks({
      muted: false,
      onTrackChange: (f: (name: string) => void) => {
        listener = f;
      },
    });
    listener("Theme");
    expect(el("now-playing").textContent).toBe("♫ Theme");
    expect(el("title-track").textContent).toBe("♫ Theme · SOUND ON");
    listener("");
    expect(el("now-playing").textContent).toBe("♫ —");
  });
});
