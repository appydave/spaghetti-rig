import {
  SILENCE,
  STOP_PADDING,
  cleanup,
  noiseVoice,
  rand,
} from "#root/src/audio/voice-kit.ts";

/** What the effect voices draw on: the audio context and the shared noise buffer. */
export interface SfxKit {
  ctx: AudioContext;
  noise: AudioBuffer | null;
}

const DEFAULT_TONE_ATTACK = 0.004;
const DEFAULT_NOISE_ATTACK = 0.003;
const DEFAULT_NOISE_Q = 0.8;
/** A tone ramps to at least this peak, and its decay lasts at least this long after its attack. */
const MIN_PEAK = 0.0002;
const MIN_DECAY = 0.01;
/** The shared noise buffer is two seconds long, so a noise voice may last at most this long. */
const NOISE_MAX_SECONDS = 1.95;

export interface ToneOpts {
  type?: OscillatorType;
  f: number;
  f2?: number;
  dur: number;
  vol: number;
  attack?: number;
  lp?: number;
  detune?: number;
  sweep?: number;
}
export interface NoiseOpts {
  filter: BiquadFilterType;
  f: number;
  f2?: number;
  q?: number;
  dur: number;
  vol: number;
  attack?: number;
}

export function tone(
  kit: SfxKit,
  dest: AudioNode,
  t: number,
  o: ToneOpts,
): void {
  const { ctx } = kit;
  const osc = ctx.createOscillator();

  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2 !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, o.f2),
      t + o.dur * (o.sweep ?? 1),
    );
  }

  if (o.detune) {
    osc.detune.value = o.detune;
  }

  const g = ctx.createGain();
  const a = o.attack ?? DEFAULT_TONE_ATTACK;

  g.gain.setValueAtTime(SILENCE, t);
  g.gain.exponentialRampToValueAtTime(Math.max(MIN_PEAK, o.vol), t + a);
  g.gain.exponentialRampToValueAtTime(
    SILENCE,
    t + Math.max(a + MIN_DECAY, o.dur),
  );

  const nodes: AudioNode[] = [osc, g];

  if (o.lp) {
    const lp = ctx.createBiquadFilter();

    lp.type = "lowpass";
    lp.frequency.value = o.lp;
    osc.connect(lp).connect(g);
    nodes.push(lp);
  } else {
    osc.connect(g);
  }

  g.connect(dest);
  osc.start(t);
  osc.stop(t + o.dur + STOP_PADDING);
  cleanup(osc, nodes);
}

export function noise(
  kit: SfxKit,
  dest: AudioNode,
  t: number,
  o: NoiseOpts,
): void {
  const { ctx } = kit;

  if (!kit.noise) {
    return;
  }

  const { src, f } = noiseVoice(ctx, kit.noise, o.filter);

  f.Q.value = o.q ?? DEFAULT_NOISE_Q;
  f.frequency.setValueAtTime(o.f, t);
  if (o.f2 !== undefined) {
    f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  }

  const g = ctx.createGain();
  const a = o.attack ?? DEFAULT_NOISE_ATTACK;

  g.gain.setValueAtTime(SILENCE, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + a);
  g.gain.exponentialRampToValueAtTime(
    SILENCE,
    t + Math.max(a + MIN_DECAY, o.dur),
  );
  src.connect(f).connect(g).connect(dest);

  const dur = Math.min(o.dur + STOP_PADDING, NOISE_MAX_SECONDS);

  src.start(t, rand(0, 2 - dur));
  src.stop(t + dur);
  cleanup(src, [src, f, g]);
}
