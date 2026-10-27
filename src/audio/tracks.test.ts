import { describe, it, expect } from "vitest";
import {
  TRACK_DEFS,
  TRACKS,
  COMPILED_TRACKS,
  MUSIC_THEMES,
  tracksForTheme,
  parseNote,
  parseMelodyBar,
  parseChord,
  midiToFreq,
} from "#root/src/audio/tracks.ts";
import { TRACKS as API_TRACKS, AudioEngine } from "#root/src/audio/audio.ts";

const sane = (n: number) => Number.isFinite(n) && n >= 24 && n <= 108;

describe("note parsing", () => {
  it("parses scientific pitch names", () => {
    expect(parseNote("C4")).toBe(60);
    expect(parseNote("A4")).toBe(69);
    expect(parseNote("F#5")).toBe(78);
    expect(parseNote("Bb1")).toBe(34);
    expect(() => parseNote("H2")).toThrow();
    expect(midiToFreq(69)).toBeCloseTo(440);
  });
});

describe("soundtrack", () => {
  it("has at least 7 tracks and the API re-exports them", () => {
    expect(TRACKS.length).toBeGreaterThanOrEqual(7);
    expect(API_TRACKS).toEqual(TRACKS);
  });

  it("covers every musical theme, walk has 2+", () => {
    for (const theme of MUSIC_THEMES) {
      expect(tracksForTheme(theme).length).toBeGreaterThanOrEqual(1);
    }

    expect(tracksForTheme("walk").length).toBeGreaterThanOrEqual(2);
    expect(tracksForTheme("silent").length).toBe(0);
  });

  it("has unique names", () => {
    const names = TRACKS.map((t) => t.name);

    expect(new Set(names).size).toBe(names.length);
    for (const n of names) {
      expect(n.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps tempos in range", () => {
    for (const t of TRACK_DEFS) {
      expect(t.bpm).toBeGreaterThanOrEqual(100);
      expect(t.bpm).toBeLessThanOrEqual(150);
      if (t.theme === "walk") {
        expect(t.bpm).toBeGreaterThanOrEqual(120);
        expect(t.bpm).toBeLessThanOrEqual(140);
      }

      if (t.theme === "boss") {
        expect(t.bpm).toBeGreaterThanOrEqual(140);
      }
    }
  });

  for (const def of TRACK_DEFS) {
    describe(def.name, () => {
      const stepsPerBar = def.beatsPerBar * 4;
      const bars = def.melody.length;

      it("every melody bar fills exactly one bar", () => {
        expect(bars).toBeGreaterThanOrEqual(4);
        def.melody.forEach((bar, i) => {
          const total = parseMelodyBar(bar).reduce((s, t) => s + t.len, 0);

          expect(total, `bar ${i + 1}: "${bar}"`).toBe(stepsPerBar);
        });
      });

      it("harmony spans exactly the melody length", () => {
        const beats = def.harmony.reduce(
          (s, h) => s + parseChord(h, def.beatsPerBar).beats,
          0,
        );

        expect(beats).toBe(bars * def.beatsPerBar);
      });

      it("patterns are one bar long", () => {
        for (const p of [def.bass, def.arp, def.comp, def.perc]) {
          if (p !== undefined) {
            expect(p.length).toBe(stepsPerBar);
          }
        }
      });

      it("every melody note is finite and in a sane MIDI range", () => {
        for (const bar of def.melody) {
          for (const t of parseMelodyBar(bar)) {
            if (t.midi !== null) {
              expect(sane(t.midi)).toBe(true);
            }
          }
        }
      });

      it("every chord has a finite bass and a pad of three or more finite notes", () => {
        for (const h of def.harmony) {
          const c = parseChord(h, def.beatsPerBar);

          expect(sane(c.bass)).toBe(true);
          expect(c.pad.length).toBeGreaterThanOrEqual(3);
          c.pad.forEach((n) => expect(sane(n)).toBe(true));
        }
      });

      it("the compiled track fills every bar and keeps every note finite and in a sane MIDI range", () => {
        const compiled = COMPILED_TRACKS.find((c) => c.def === def)!;

        expect(compiled.steps.length).toBe(bars * stepsPerBar);
        for (const s of compiled.steps) {
          for (const n of [
            s.lead?.midi,
            s.bass?.midi,
            s.arp,
            ...(s.comp ?? []),
            ...(s.chord?.pad ?? []),
          ]) {
            if (n !== undefined) {
              expect(sane(n)).toBe(true);
            }
          }
        }

        expect(compiled.steps.filter((s) => s.lead).length).toBeGreaterThan(
          bars,
        );
      });
    });
  }
});

describe("AudioEngine without Web Audio", () => {
  it("is a harmless no-op in Node", async () => {
    const a = new AudioEngine();

    a.setTheme("walk");
    expect(a.theme).toBe("walk");
    a.play("shoot", { pan: -1, volume: 0.5 });
    a.play("debrisBounce");
    a.muted = true;
    a.paused = true;
    a.paused = false;
    await a.unlock();
    expect(a.trackName).toBe("");
    a.setTheme("silent");
  });
});
