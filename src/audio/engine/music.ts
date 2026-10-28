import {
  tracksForTheme,
  type CompiledTrack,
  type Theme,
} from "#root/src/audio/tracks.ts";
import type { Deck } from "#root/src/audio/music/deck.ts";
import { buildEcho } from "#root/src/audio/music/echo.ts";
import { leadNote } from "#root/src/audio/music/lead.ts";
import { padChord, compStab } from "#root/src/audio/music/chords.ts";
import { bassNote, pluck, bell, perc } from "#root/src/audio/music/hits.ts";
import { present } from "#root/src/nth.ts";
import { SILENCE } from "#root/src/audio/voice-kit.ts";
import {
  scheduleDeck,
  type SequencerHost,
} from "#root/src/audio/music/sequencer.ts";

/** Music uses a lookahead scheduler (25 ms tick, 150 ms horizon) on ctx.currentTime. */
const TICK_MS = 25;
const LOOKAHEAD = 0.15;
const XFADE = 1.2;
/** A new theme's first track starts this long after the theme is set. */
const THEME_START_DELAY = 0.06;
/** A deck's gain starts rising this long before its first step. */
const DECK_FADE_LEAD = 0.05;
/** A deck that has stopped scheduling is kept this long for its tails to ring out, then disposed. */
const DECK_TAIL_SECONDS = 3;
/** The next track of a theme fades in this fast. */
const NEXT_DECK_FADE_IN = 0.03;
/** The deck that rolls over fades out over this long. */
const ROLL_OVER_FADE = 1.0;

/** What the music plays through: the audio context, the music bus and the shared noise buffer. */
export interface MusicRig {
  ctx: AudioContext;
  bus: GainNode;
  noise: AudioBuffer | null;
}

/** The music: which theme is wanted, the decks playing it, and the scheduler that keeps them sounding. */
export class Music {
  theme: Theme = "silent";
  trackName = "";
  current: Deck | null = null;
  private rig: MusicRig | null = null;
  private decks: Deck[] = [];
  private readonly rotation = new Map<Theme, number>();
  private readonly listeners: ((name: string) => void)[] = [];
  /** What the sequencer asks of this music: the voices, and rolling a finished deck over to the next track. */
  private readonly sequencer: SequencerHost = {
    voices: { padChord, bassNote, leadNote, pluck, bell, compStab, perc },
    rollOver: (deck, at) => this.rollOver(deck, at),
  };

  /** Start the scheduler on the rig. */
  attach(rig: MusicRig): void {
    this.rig = rig;
    setInterval(() => this.tick(), TICK_MS);
  }

  onTrackChange(cb: (name: string) => void): void {
    this.listeners.push(cb);
  }

  setTheme(theme: Theme): void {
    if (theme === this.theme) {
      return;
    }

    this.theme = theme;
    try {
      this.applyTheme();
    } catch {
      /* ignore */
    }
  }

  /** Start the theme's first track if nothing is playing yet. */
  wake(): void {
    if (!this.current && this.theme !== "silent") {
      this.applyTheme();
    }
  }

  private setTrackName(name: string): void {
    if (name === this.trackName) {
      return;
    }

    this.trackName = name;
    for (const cb of this.listeners) {
      try {
        cb(name);
      } catch {
        /* listener bug */
      }
    }
  }

  private nextTrackFor(theme: Theme): CompiledTrack | null {
    const list = tracksForTheme(theme);

    if (list.length === 0) {
      return null;
    }

    const idx = this.rotation.get(theme) ?? 0;

    this.rotation.set(theme, idx + 1);

    return list[idx % list.length] ?? null;
  }

  private applyTheme(): void {
    const ctx = this.rig?.ctx;

    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    const track = this.nextTrackFor(this.theme);

    for (const d of this.decks) {
      if (d.stopAt === null) {
        this.retire(d, now, XFADE);
      }
    }

    this.current = null;
    if (!track) {
      this.setTrackName("");

      return;
    }

    this.current = this.createDeck(track, now + THEME_START_DELAY, XFADE);
    this.setTrackName(track.def.name);
  }

  /** Stop scheduling a deck at `at` and fade it out over `fade`. */
  private retire(d: Deck, at: number, fade: number): void {
    const { ctx } = this.presentRig;

    d.stopAt = at + fade;

    const g = d.out.gain;
    const from = Math.max(at, ctx.currentTime);

    g.cancelScheduledValues(from);
    g.setValueAtTime(g.value || 1, from);
    g.linearRampToValueAtTime(SILENCE, from + fade);
  }

  private get presentRig(): MusicRig {
    return present(this.rig, "the music rig");
  }

  private createDeck(
    track: CompiledTrack,
    start: number,
    fadeIn: number,
  ): Deck {
    const { ctx, bus, noise } = this.presentRig;
    const out = ctx.createGain();

    out.gain.setValueAtTime(
      SILENCE,
      Math.max(ctx.currentTime, start - DECK_FADE_LEAD),
    );
    out.gain.linearRampToValueAtTime(1, start + fadeIn);
    out.connect(bus);

    const echo = buildEcho(ctx, out, track.stepSec);
    const deck: Deck = {
      track,
      ctx,
      noise,
      out,
      delayIn: echo.input,
      fx: echo.nodes,
      start,
      abs: 0,
      stopAt: null,
    };

    this.decks.push(deck);

    return deck;
  }

  private disposeDeck(d: Deck): void {
    for (const n of d.fx) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }

    try {
      d.out.disconnect();
    } catch {
      /* ignore */
    }
  }

  private tick(): void {
    const ctx = this.rig?.ctx;

    if (ctx?.state !== "running") {
      return;
    }

    try {
      const now = ctx.currentTime;
      const horizon = now + LOOKAHEAD;
      // Iterate a snapshot: scheduleDeck can roll over to a new track, and createDeck pushes onto decks.
      const decksAtTickStart = this.decks.slice();

      for (const deck of decksAtTickStart) {
        scheduleDeck(deck, now, horizon, this.sequencer);
      }

      this.decks = this.decks.filter((d) => {
        if (d.stopAt !== null && now > d.stopAt + DECK_TAIL_SECONDS) {
          this.disposeDeck(d);

          return false;
        }

        return true;
      });
    } catch {
      /* keep ticking */
    }
  }

  /** The deck has played its loops: if its theme has another track, fade this deck out and start that one at `at`. */
  private rollOver(deck: Deck, at: number): boolean {
    if (deck !== this.current || tracksForTheme(this.theme).length < 2) {
      return false;
    }

    const next = this.nextTrackFor(this.theme);

    if (!next) {
      return false;
    }

    this.retire(deck, at, ROLL_OVER_FADE);
    deck.stopAt = at; // hard stop scheduling; tails fade
    this.current = this.createDeck(next, at, NEXT_DECK_FADE_IN);
    this.setTrackName(next.def.name);

    return true;
  }
}
