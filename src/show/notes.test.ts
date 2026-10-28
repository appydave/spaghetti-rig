import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseContent } from "#root/src/content/load.ts";
import { buildScript } from "#root/src/content/script.ts";
import { notesFor } from "#root/src/show/notes.ts";

const raw = JSON.parse(
  readFileSync(
    new URL("../../public/content/cards.json", import.meta.url),
    "utf8",
  ),
);
const game = parseContent(raw);
const script = buildScript(game);

describe("notes", () => {
  it("every step has notes, and card steps carry the line to say", () => {
    for (const s of script) {
      const n = notesFor(game, s, "both");

      expect(n.heading).toBeTruthy();
      if (s.phase === "problem" || s.phase === "tool") {
        expect(n.say).toBeTruthy();
      }
    }
  });
});
