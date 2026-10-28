import { toolFor } from "#root/src/content/load.ts";
import type { Stop } from "#root/src/content/types.ts";
import { queryElOrNull } from "#root/src/dom.ts";
import { nth } from "#root/src/nth.ts";
import { $, laneEl, type LaneContext } from "#root/src/show/director/shared.ts";
import type { Player } from "#root/src/show/script.ts";
import { esc, shortTool } from "#root/src/ui/card.ts";

/** A banner takes this long to fade out before it is hidden. */
const BANNER_FADE_SECONDS = 0.35;

interface Caption {
  label: string;
  text: string;
}

function problemCaption(p: Player, stop: Stop | undefined): Caption {
  return p === "p1"
    ? { label: "NO GATE", text: stop?.p1.say ?? "" }
    : {
        label: "HIT · TOOL CARD READY",
        text: "A gate can stop this. Play the card →",
      };
}

function toolCaption(
  p: Player,
  fixed: boolean,
  stop: Stop | undefined,
): Caption | null {
  if (p === "p1") {
    return {
      label: "PLAYER 1 · NO TOOL CARD",
      text: "No gate, no fix, no heal. Ship it anyway.",
    };
  }

  return fixed ? { label: "FIXED IN THIS PR", text: stop?.p2.say ?? "" } : null;
}

function bossPartCaption(ctx: LaneContext, p: Player): Caption {
  const { game, step } = ctx;
  const parts = ctx.tier.boss.parts;
  const part = nth(parts, step.part, "boss parts");

  return p === "p1"
    ? {
        label: "NOTHING WORKS",
        text:
          step.part === 0
            ? "Shots bounce off. One blow and player 1 is down."
            : "Player 1 is down. The boss keeps coming.",
      }
    : {
        label: `SIN ${step.part + 1} OF ${parts.length}`,
        text: `${part.part} ← ${shortTool(toolFor(game, part.beatenBy).name)}`,
      };
}

/** What this side is told on this step, if anything. */
export function captionFor(ctx: LaneContext, p: Player): Caption | null {
  const { step, tier } = ctx;
  const b = tier.boss;
  const stop = tier.stops[step.stop];

  switch (step.phase) {
    case "problem":
      return problemCaption(p, stop);
    case "tool":
    case "fixed":
      return toolCaption(p, step.phase === "fixed", stop);
    case "boss":
      return { label: "THE BOSS ATTACKS", text: b.attack ?? b.idea ?? "" };
    case "bossPart":
      return bossPartCaption(ctx, p);
    case "bossDown":
      return {
        label: p === "p1" ? "PLAYER 1" : "PLAYER 2",
        text: (p === "p1" ? b.p1 : b.p2) ?? "",
      };
    default:
      return null;
  }
}

/** Show a lane's caption, now or after `delay` seconds; no caption (or no text) leaves it hidden. */
export function caption(
  ctx: LaneContext,
  p: Player,
  c: Caption | null,
  delay: number,
) {
  const lane = laneEl(p);
  const el = lane ? queryElOrNull(lane, ".caption") : null;

  if (!el) {
    return;
  }

  el.hidden = true;
  if (!c?.text) {
    return;
  }

  const show = () => {
    el.innerHTML = `<span class="label">${esc(c.label)}</span>${esc(c.text)}`;
    el.hidden = false;
  };

  if (delay > 0) {
    ctx.after(delay, show);
  } else {
    show();
  }
}

export function banner(
  after: LaneContext["after"],
  label: string,
  html: string,
  seconds: number,
) {
  const b = $("banner");

  $("banner-label").textContent = label;
  $("banner-text").innerHTML = html;
  b.classList.remove("out");
  b.hidden = false;
  after(seconds, () => {
    b.classList.add("out");
    after(BANNER_FADE_SECONDS, () => {
      b.hidden = true;
    });
  });
}

export function hideBanner(now: boolean) {
  if (now) {
    $("banner").hidden = true;
  }
}
