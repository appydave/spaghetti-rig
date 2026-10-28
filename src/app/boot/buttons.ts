// The page's buttons and the tier map's clicks, wired to the app. Moved out of main.ts's boot().
import type { App } from "#root/src/app/boot/app.ts";
import { clickAction } from "#root/src/app/boot/clicks.ts";
import { byId, closestEl, queryAllEl } from "#root/src/dom.ts";
import { MODES } from "#root/src/content/script.ts";

const $ = (id: string) => byId(id, HTMLElement);

/** A click on the tier map: the chosen tier starts; another tier becomes the choice. */
function tierClick(app: App, e: Event) {
  const li = closestEl(e.target, ".tier");

  if (!li) {
    return;
  }

  const i = Number(li.dataset.i);

  if (i === app.selected) {
    app.start(i);
  } else {
    app.selected = i;
    app.renderMap();
    app.audio.play("uiMove");
  }
}

/** A click on any `data-action` button runs its action, then the button lets go of focus. */
function actionClick(app: App, e: Event) {
  const a = closestEl(e.target, "[data-action]");

  if (!a) {
    return;
  }

  clickAction(app, a.dataset.action);

  // A clicked button keeps focus; let it go, so Space stays "next" and never presses it again.
  if (a instanceof HTMLButtonElement) {
    a.blur();
  }
}

/** Wire the enter and start buttons, the mode buttons, the tier map and the action buttons. */
export function wireButtons(app: App) {
  $("enter").addEventListener("click", () => void app.enter());
  $("start").addEventListener("click", () => {
    app.show("map");
    app.audio.play("uiSelect");
  });
  for (const b of queryAllEl(document, "[data-mode]")) {
    b.addEventListener("click", () => {
      const mode = MODES.find((x) => x.mode === b.dataset.mode);

      if (!mode) {
        throw new Error(`Unknown mode "${b.dataset.mode}"`);
      }

      app.setMode(mode.mode);
      b.blur();
    });
  }

  $("tiers").addEventListener("click", (e) => tierClick(app, e));
  document.addEventListener("click", (e) => actionClick(app, e));
}
