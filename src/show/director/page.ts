// What the page's markup fixes (G13 A2): how to find an element, and how many digits a score shows. Moved out of shared.ts as it was.
import { byId, queryElOrNull } from "#root/src/dom.ts";
import type { Player } from "#root/src/content/script.ts";

export const $ = (id: string) => byId(id, HTMLElement);

/** Scores are shown as this many digits, padded with zeros. */
export const SCORE_DIGITS = 6;

export const laneEl = (p: Player) =>
  queryElOrNull(document, `.lane[data-p='${p}']`);
