// A Director on a fresh page with everything around it recording, and a way to look at the lot (G04 H2). Used by director-proof.test.ts,
// which runs under happy-dom: the page is the real index.html body, the stage and worlds are the fakes in director-dom.ts.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { parseContent } from "../../src/content/load";
import { Director } from "../../src/show/director";
import type { Mode } from "../../src/show/script";
import {
  FakeChannel,
  FakeStage,
  FakeWorld,
  pageBody,
  script,
} from "./director-dom";

const FRAMES_PER_SECOND = 20;
const HASH_CHARS = 12;

export const FRAME = 1 / FRAMES_PER_SECOND;

const sha = (s: string) =>
  createHash("sha1").update(s).digest("hex").slice(0, HASH_CHARS);

const MULBERRY = 0x6d2b79f5;
const SHIFT_A = 15;
const SHIFT_B = 7;
const MIX_B = 61;
const SHIFT_C = 14;
const UINT32 = 4294967296;

export const game = parseContent(
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, "../../public/content/cards.json"),
      "utf8",
    ),
  ),
);

/** A small repeatable random number generator (mulberry32). */
function seeded(seed: number): () => number {
  let s = seed;

  return () => {
    s = Math.trunc(s + MULBERRY);

    let t = Math.imul(s ^ (s >>> SHIFT_A), 1 | s);

    t = (t + Math.imul(t ^ (t >>> SHIFT_B), MIX_B | t)) ^ t;

    return ((t ^ (t >>> SHIFT_C)) >>> 0) / UINT32;
  };
}

export class Show {
  readonly log: string[] = [];
  readonly looks: string[] = [];
  readonly stage: FakeStage;
  readonly worlds = {
    p1: new FakeWorld("p1", this.log),
    p2: new FakeWorld("p2", this.log),
  };
  readonly director: Director;
  private clock = 0;
  private readonly real = Math.random;

  constructor(mode: Mode, seed: number) {
    document.body.innerHTML = pageBody();
    document.body.removeAttribute("data-phase");
    FakeChannel.log = this.log;
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    vi.stubGlobal("setTimeout", (_fn: () => void, ms: number) =>
      this.log.push(`setTimeout ${ms}`),
    );
    window.addEventListener("rig-command", (e) =>
      this.log.push(`rig-command ${JSON.stringify(e)}`),
    );
    Math.random = seeded(seed);
    this.stage = new FakeStage(mode, this.log);

    // The Director is built against the shapes the real stage, worlds and audio engine have; the fakes carry only what it uses.
    const log = this.log;
    const audio = {
      set paused(v: boolean) {
        log.push(`audio.paused ${v}`);
      },
      play: (name: string, o?: { pan?: number }) =>
        log.push(`audio.play ${name} ${o?.pan ?? ""}`),
      setTheme: (t: string) => log.push(`audio.setTheme ${t}`),
    };

    this.director = Reflect.construct(Director, [
      game,
      this.stage,
      this.worlds,
      audio,
      mode,
    ]);
    this.director.active = true;
    this.director.onExit = () => this.log.push("onExit");
    this.director.onScore = (n) => this.log.push(`onScore ${n}`);
  }

  close(): void {
    Math.random = this.real;
    vi.unstubAllGlobals();
  }

  /** Run this many frames, scripting the worlds' numbers before each. */
  frames(n: number): void {
    for (let i = 0; i < n; i++) {
      this.clock += FRAME;
      for (const w of [this.worlds.p1, this.worlds.p2]) {
        script(w, this.clock, this.director.step, game);
      }

      this.director.update(FRAME);
    }
  }

  /** Fingerprint the page, the Director's own state and everything recorded since the last look. */
  look(label: string): void {
    const d = this.director;
    const state = JSON.stringify([
      d.at,
      d.mode,
      d.paused,
      d.autoplay,
      d.notesOn,
      d.active,
    ]);
    const page = `${document.body.dataset.phase}|${document.body.innerHTML}`;

    this.looks.push(
      `${label} ${sha(`${page}#${state}#${this.log.splice(0).join("\n")}`)}`,
    );
  }
}
