import type {
  NoiseOpts,
  SfxKit,
  ToneOpts,
} from "#root/src/audio/sfx/voices.ts";

/** A brass note: its pitch, length and level. */
export interface HornNote {
  midi: number;
  dur: number;
  vol: number;
}
/** A trombone note: its pitch and length, and whether it wobbles. */
export interface SlideNote {
  midi: number;
  dur: number;
  wobble: boolean;
}

/** The four voices an effect is built from, each given where it sounds and when. */
export interface SfxVoices {
  tone(dest: AudioNode, t: number, o: ToneOpts): void;
  noise(dest: AudioNode, t: number, o: NoiseOpts): void;
  brass(dest: AudioNode, t: number, h: HornNote): void;
  trombone(dest: AudioNode, t: number, h: SlideNote): void;
}

/** What the effect voices run with: the kit, and the voices themselves (a test replaces these). */
export interface SfxRig {
  kit: SfxKit;
  voices: SfxVoices;
}
