import { closestEl } from "#root/src/dom.ts";
import { aim } from "#root/src/show/director/lanes.ts";
import { laneContext, type ShowState } from "#root/src/show/director/shared.ts";
import { broadcast } from "#root/src/show/director/view.ts";
import { parseDirectorMessage } from "#root/src/show/messages.ts";

/** Presenter messages in, and the pointer: what the show hears from outside. */
export const listen = (s: ShowState) => {
  const run = s.run;

  run.channel?.addEventListener("message", (e) => {
    const m = parseDirectorMessage(e.data);

    if (!m) {
      return;
    }

    if (m.type === "hello") {
      broadcast(s);
    } else {
      dispatchEvent(new CustomEvent("rig-command", { detail: m.key }));
    }
  });

  // The HUD lets the pointer through, so a press over the street lands on the canvas, which sits
  // beside #game rather than inside it. Listen on the window and fire on the press itself: a quick
  // trackpad tap is a very short press, and waiting for `click` would add nothing.
  const move = (e: PointerEvent) => {
    run.pointer = { x: e.clientX, y: e.clientY };
  };

  addEventListener("pointermove", move);
  addEventListener("pointerdown", (e) => {
    if (!s.active || s.paused || e.button !== 0) {
      return;
    }

    if (closestEl(e.target, "button, a, .tcard, .overlay")) {
      return;
    }

    run.pointer = { x: e.clientX, y: e.clientY };
    aim(laneContext(s), run.pointer, true);
  });
  document.documentElement.addEventListener("pointerleave", () => {
    run.pointer = null;
  });
};
