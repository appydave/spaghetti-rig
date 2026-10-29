import type { PlayOptions, Sfx } from "#root/src/audio/types.ts";
import { playRecipe } from "#root/src/audio/sfx/play.ts";
import { brass, trombone } from "#root/src/audio/sfx/horns.ts";
import type { SfxVoices } from "#root/src/audio/sfx/rig.ts";
import { noise, tone, type SfxKit } from "#root/src/audio/sfx/voices.ts";

/** Plays the sound effects: which are too soon or too many to start, and the output each one gets. */

/** A new sound effect starts this long after it is asked for, so it is never scheduled in the past. */
const SFX_START_DELAY = 0.005;
/** How many sound effects may overlap before a new one is dropped (a low-priority one is dropped sooner). */
const SFX_VOICE_CAP = 64;
const LOW_PRIORITY_VOICE_CAP = 24;
/** A sound effect's output is kept this long after its tail. */
const SFX_TAIL_SECONDS = 0.4;

export const MS_PER_SECOND = 1000;

/** Minimum seconds between two plays of the same effect: the chattiest effects, shots, crackles, steps, damage and bounces. */
const CHATTY_GAP = 0.03;
const SHOOT_GAP = 0.035;
const CRACKLE_GAP = 0.04;
const STEP_GAP = 0.07;
const DAMAGE_GAP = 0.08;
const BOUNCE_GAP = 0.06;
/** The gap for every effect not listed here. */
const DEFAULT_GAP = 0.02;
const RATE_LIMIT: Partial<Record<Sfx, number>> = {
  debrisBounce: CRACKLE_GAP,
  step: STEP_GAP,
  enemyHit: CHATTY_GAP,
  shoot: SHOOT_GAP,
  shootP1: SHOOT_GAP,
  uiMove: CHATTY_GAP,
  glassCrack: CRACKLE_GAP,
  enemyPop: CHATTY_GAP,
  damage: DAMAGE_GAP,
  bounce: BOUNCE_GAP,
};
const LOW_PRIORITY = new Set<Sfx>([
  "debrisBounce",
  "step",
  "enemyHit",
  "uiMove",
]);
/** Seconds an effect's output stays connected before it is torn down: the longest tail it can have. */
const WIN_LIFE = 3;
const LOSE_LIFE = 2.6;
const BOSS_ARRIVE_LIFE = 2.6;
const BOSS_DEFEAT_LIFE = 2.2;
const HEAL_LIFE = 1.6;
const CODE_FIX_LIFE = 1.2;
const SHATTER_LIFE = 0.8;
const SFX_LIFE: Partial<Record<Sfx, number>> = {
  win: WIN_LIFE,
  lose: LOSE_LIFE,
  bossArrive: BOSS_ARRIVE_LIFE,
  bossDefeat: BOSS_DEFEAT_LIFE,
  heal: HEAL_LIFE,
  codeFix: CODE_FIX_LIFE,
  cardPlay: 1,
  shatter: SHATTER_LIFE,
};

/** An effect with no entry in the life table keeps its output this long. */
const DEFAULT_LIFE = 0.6;

/** How many sounding effects stop this one from starting. */
const voiceCap = (sfx: Sfx): number =>
  LOW_PRIORITY.has(sfx) ? LOW_PRIORITY_VOICE_CAP : SFX_VOICE_CAP;

const clamp = (v: number, a: number, b: number): number =>
  Math.min(b, Math.max(a, v));

export class SfxPlayer {
  private readonly lastPlayed = new Map<Sfx, number>();
  private activeSfx = 0;
  private readonly kit: SfxKit;
  /** What an effect's layers sound through. */
  private readonly sfxVoices: SfxVoices;

  constructor(
    private readonly ctx: AudioContext,
    private readonly bus: GainNode,
    noiseBuffer: AudioBuffer | null,
  ) {
    this.kit = { ctx, noise: noiseBuffer };
    this.sfxVoices = {
      tone: (dest, t, o) => tone(this.kit, dest, t, o),
      noise: (dest, t, o) => noise(this.kit, dest, t, o),
      brass: (dest, t, h) => brass(this.kit, dest, t, h),
      trombone: (dest, t, h) => trombone(this.kit, dest, t, h),
    };
  }

  /** Start the effect now, unless the context is not running, it was played too lately, or too many are sounding. */
  play(sfx: Sfx, opts: PlayOptions): void {
    if (this.ctx.state !== "running") {
      return;
    }

    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(sfx) ?? -1;

    if (now - last < (RATE_LIMIT[sfx] ?? DEFAULT_GAP)) {
      return;
    }

    if (this.activeSfx > voiceCap(sfx)) {
      return;
    }

    this.lastPlayed.set(sfx, now);
    try {
      this.playSfx(sfx, now + SFX_START_DELAY, opts);
    } catch {
      /* ignore */
    }
  }

  private sfxOut(opts: PlayOptions, life: number): GainNode {
    const g = this.ctx.createGain();

    g.gain.value = clamp(opts.volume ?? 1, 0, 1);

    const p = this.ctx.createStereoPanner();

    p.pan.value = clamp(opts.pan ?? 0, -1, 1);
    g.connect(p).connect(this.bus);
    this.activeSfx++;
    setTimeout(
      () => {
        this.activeSfx--;
        try {
          g.disconnect();
          p.disconnect();
        } catch {
          /* ignore */
        }
      },
      (life + SFX_TAIL_SECONDS) * MS_PER_SECOND,
    );

    return g;
  }

  private playSfx(sfx: Sfx, t: number, opts: PlayOptions): void {
    const out = this.sfxOut(opts, SFX_LIFE[sfx] ?? DEFAULT_LIFE);

    playRecipe({ kit: this.kit, voices: this.sfxVoices }, out, sfx, t);
  }
}
