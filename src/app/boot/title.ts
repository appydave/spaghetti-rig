// The title screen's words, from the content file, and the best score and the track labels it shows. Moved out of main.ts's boot().
import type { AudioEngine } from "#root/src/audio/audio.ts";
import { TRACKS } from "#root/src/audio/audio.ts";
import type { Game } from "#root/src/content/load.ts";
import { byId } from "#root/src/dom.ts";
import { SCORE_DIGITS } from "#root/src/show/director/shared.ts";

const $ = (id: string) => byId(id, HTMLElement);

/** Show the best score, padded like the in-game score. */
export function showBest(best: number) {
  $("best").textContent = String(best).padStart(SCORE_DIGITS, "0");
}

/** Fill the title screen: the title split over two lines (its last word on the second), the tagline, the page title, the best score and the soundtrack. */
export function fillTitle(game: Game, best: number) {
  const words = game.content.screens.title.big.trim().split(/\s+/);

  $("title-1").textContent = (
    words.slice(0, -1).join(" ") ||
    words[0] ||
    ""
  ).toUpperCase();
  $("title-2-word").textContent = (words.slice(1).at(-1) ?? "").toUpperCase();
  $("tagline").textContent = game.content.screens.title.sub;
  document.title = game.content.screens.title.big;
  showBest(best);
  $("track-list").textContent =
    `Soundtrack: ${TRACKS.map((t) => t.name).join(", ")}.`;
}

/** Keep the now-playing labels on the track that is playing, and the title's sound label in step. */
export function followTracks(
  audio: Pick<AudioEngine, "muted" | "onTrackChange">,
) {
  audio.onTrackChange((name) => {
    const s = name ? `♫ ${name}` : "♫ —";

    $("now-playing").textContent = s;
    $("title-track").textContent =
      `${s} · ${audio.muted ? "SOUND OFF" : "SOUND ON"}`;
  });
}
