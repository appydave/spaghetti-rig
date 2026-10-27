import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bossLayout, overlaps } from "#root/src/world/bosslayout.ts";

describe("boss layout", () => {
  const raw = JSON.parse(
    readFileSync(
      new URL("../../public/content/cards.json", import.meta.url),
      "utf8",
    ),
  );
  const counts = new Set<number>([
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    ...raw.tiers.map(
      (t: { boss: { parts: unknown[] } }) => t.boss.parts.length,
    ),
  ]);

  for (const n of counts) {
    it(`${n} part(s): none covers the main window, the head or another part`, () => {
      const L = bossLayout(n);

      expect(L.parts).toHaveLength(n);
      expect(overlaps(L.head, L.core)).toBe(true); // the head sits on the window's top edge…
      expect(L.head.y - L.head.h / 2).toBeGreaterThan(
        L.core.y + L.core.h / 2 - 0.3,
      ); // …only just
      L.parts.forEach((p, i) => {
        expect(overlaps(p, L.core, 0.2)).toBe(false);
        expect(overlaps(p, L.head, 0.2)).toBe(false);
        L.parts.forEach((q, j) => {
          if (i !== j) {
            expect(overlaps(p, q, 0.2)).toBe(false);
          }
        });
        expect(p.h).toBeGreaterThan(1.2);
        expect(Math.abs(p.x) + p.w / 2).toBeLessThanOrEqual(L.width / 2 + 1e-9);
      });
    });
  }
});
