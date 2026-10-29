/**
 * Spaghetti Rig audio engine — everything is synthesised live with Web Audio.
 *
 * Graph:  deck voices -> deck.out --\
 *                                   musicBus --\
 *         sfx voices -> sfx.out ---- sfxBus ----+-> master -> compressor -> limiter -> speakers
 *                           (both buses also send to a generated-noise convolver reverb)
 *
 * Every voice disconnects itself when its oscillators end.
 */
import {
  buildGraph,
  openContext,
  MASTER_LEVEL,
} from "#root/src/audio/engine/graph.ts";
import { TRACKS as TRACK_LIST } from "#root/src/audio/tracks.ts";
import { present } from "#root/src/nth.ts";
import type {
  AudioParts,
  MusicPlayer,
  PlayOptions,
  Sfx,
  SfxOutput,
  Theme,
} from "#root/src/audio/types.ts";

/** Every track's name, theme and tempo, for the track list. */
export const TRACKS: { name: string; theme: Theme; bpm: number }[] = TRACK_LIST;

/** Seconds a gain change on the master takes to settle (mute and unmute). */
const MUTE_FADE = 0.04;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: SfxOutput | null = null;
  private readonly music: MusicPlayer;
  private _muted = false;
  private _paused = false;

  constructor(private readonly parts: AudioParts) {
    this.music = parts.music;
  }

  // ------------------------------------------------------------------ public API

  get theme(): Theme {
    return this.music.theme;
  }

  get trackName(): string {
    return this.music.trackName;
  }

  onTrackChange(cb: (name: string) => void): void {
    this.music.onTrackChange(cb);
  }

  async unlock(): Promise<void> {
    try {
      if (!this.ctx && !this.init()) {
        return;
      }

      this.music.wake();

      const ctx = present(this.ctx, "the audio context");

      if (!this._paused && ctx.state !== "running") {
        await ctx.resume();
      }
    } catch {
      /* never throw on stage */
    }
  }

  setTheme(theme: Theme): void {
    this.music.setTheme(theme);
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(v: boolean) {
    this._muted = v;

    const ctx = this.ctx;

    if (!ctx || !this.master) {
      return;
    }

    const g = this.master.gain;

    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.setTargetAtTime(v ? 0 : MASTER_LEVEL, ctx.currentTime, MUTE_FADE);
  }

  get paused(): boolean {
    return this._paused;
  }

  set paused(v: boolean) {
    this._paused = v;

    const ctx = this.ctx;

    if (!ctx) {
      return;
    }

    try {
      const p = v ? ctx.suspend() : ctx.resume();

      p.catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  play(sfx: Sfx, opts: PlayOptions = {}): void {
    if (!this._muted && !this._paused) {
      this.sfx?.play(sfx, opts);
    }
  }

  // ------------------------------------------------------------------ setup

  private init(): boolean {
    const ctx = openContext();

    if (!ctx) {
      return false;
    }

    this.ctx = ctx;

    const graph = buildGraph(ctx, this._muted);

    this.master = graph.master;
    this.sfx = this.parts.makeSfx(ctx, graph.sfxBus, graph.noise);
    if (this._paused) {
      ctx.suspend().catch(() => undefined);
    }

    this.music.attach({ ctx, bus: graph.musicBus, noise: graph.noise });

    return true;
  }
}
