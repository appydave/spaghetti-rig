// Pins the tier map's markup: which tiers look locked or chosen, the stop count, the art and its fallback. Built from the real content file.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tierCards } from "#root/src/app/boot/map.ts";
import { parseContent } from "#root/src/content/load.ts";

const game = parseContent(
  JSON.parse(
    readFileSync(
      new URL("../../../public/content/cards.json", import.meta.url),
      "utf8",
    ),
  ),
);
const [first, second] = game.tiers;
const stop = game.tiers.flatMap((t) => t.stops)[0];

if (!first || !second || !stop) {
  throw new Error("the content file has fewer than two tiers or no stop");
}

const open = { ...first, playable: true, stops: [stop, stop], idea: "An idea" };
const locked = { ...second, playable: false, stops: [stop], idea: undefined };

describe("the tier map", () => {
  it("one list item per tier, in order, numbered from zero", () => {
    const html = tierCards([open, locked], 0);

    expect(html.match(/<li /g)).toHaveLength(2);
    expect(html).toContain('data-i="0"');
    expect(html).toContain('data-i="1"');
  });

  it("a playable tier shows its own art, falls back to the generic tier art and says STOPS", () => {
    const html = tierCards([open], 5);

    expect(html).toContain(`src="/assets/tiers/${open.key}.svg"`);
    expect(html).toContain("this.src='/assets/tiers/generic.svg'");
    expect(html).toContain("2 STOPS<");
    expect(html).toContain("<p>An idea</p>");
    expect(html).not.toContain("LOCKED");
    expect(html).not.toContain("boss-shadow");
  });

  it("a locked tier is marked, shows its boss as a shadow and says STOP for one", () => {
    const html = tierCards([locked], 5);

    expect(html).toContain('class="tier locked"');
    expect(html).toContain('<span class="lock">LOCKED</span>');
    expect(html).toContain(`src="/assets/bosses/${locked.key}.svg"`);
    expect(html).toContain("this.src='/assets/bosses/generic.svg'");
    expect(html).toContain('class="boss-shadow"');
    expect(html).toContain("1 STOP<");
    expect(html).toContain("<p></p>");
  });

  it("only the chosen playable tier is marked chosen and offers ENTER", () => {
    expect(tierCards([open], 0)).toContain('class="tier sel"');
    expect(tierCards([open], 0)).toContain("ENTER · PLAY");
    expect(tierCards([open], 1)).not.toContain("sel");
    expect(tierCards([open], 1)).not.toContain("ENTER");
    expect(tierCards([locked], 0)).toContain('class="tier locked sel"');
    expect(tierCards([locked], 0)).not.toContain("ENTER");
  });
});
