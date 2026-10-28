import { byId } from "#root/src/dom.ts";
import { parsePresenterState } from "#root/src/show/messages.ts";
import { esc } from "#root/src/ui/card.ts";

/** ?presenter: a second window that follows the game and shows the notes for the current card. */
export function presenter() {
  document.body.classList.add("presenter-mode");

  const root = byId("presenter", HTMLElement);

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
