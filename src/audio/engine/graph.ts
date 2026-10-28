/** The shared audio graph: master chain, the two buses, the noise buffer and the reverb send. Built once, when the context is made. */

export const MASTER_LEVEL = 0.9;

const MUSIC_LEVEL = 0.3;
const SFX_LEVEL = 0.8;
/** The soft toy-room reverb: its length in seconds and how sharply its noise dies away. */
const REVERB_SECONDS = 2.2;
const REVERB_DECAY_POWER = 3.2;
const REVERB_RETURN_LEVEL = 0.55;
const MUSIC_REVERB_SEND = 0.3;
const SFX_REVERB_SEND = 0.12;
/** The white noise shared by every noisy voice is this long. */
const NOISE_SECONDS = 2;
const REVERB_CHANNELS = 2;

export interface Graph {
  master: GainNode;
  musicBus: GainNode;
  sfxBus: GainNode;
  noise: AudioBuffer;
}

/** A compressor's settings. */
interface Squeeze {
  threshold: number;
  knee: number;
  ratio: number;
  attack: number;
  release: number;
}

/** The gentle bus compressor (dB, ratio, seconds), and the hard limiter after it. */
const COMP_THRESHOLD = -16;
const COMP_KNEE = 12;
const COMP_RATIO = 4;
const COMP_ATTACK = 0.004;
const COMP_RELEASE = 0.2;
const COMPRESSOR: Squeeze = {
  threshold: COMP_THRESHOLD,
  knee: COMP_KNEE,
  ratio: COMP_RATIO,
  attack: COMP_ATTACK,
  release: COMP_RELEASE,
};
const LIMIT_THRESHOLD = -3;
const LIMIT_RATIO = 20;
const LIMIT_ATTACK = 0.001;
const LIMIT_RELEASE = 0.1;
const LIMITER: Squeeze = {
  threshold: LIMIT_THRESHOLD,
  knee: 0,
  ratio: LIMIT_RATIO,
  attack: LIMIT_ATTACK,
  release: LIMIT_RELEASE,
};

/** A compressor with its five settings made. */
function compressor(ctx: AudioContext, s: Squeeze): DynamicsCompressorNode {
  const node = ctx.createDynamicsCompressor();

  node.threshold.value = s.threshold;
  node.knee.value = s.knee;
  node.ratio.value = s.ratio;
  node.attack.value = s.attack;
  node.release.value = s.release;

  return node;
}

/** A gain node at a level. */
function gainAt(ctx: AudioContext, level: number): GainNode {
  const node = ctx.createGain();

  node.gain.value = level;

  return node;
}

/** A gain node at a level, already connected on to `to`. */
function gainTo(ctx: AudioContext, level: number, to: AudioNode): GainNode {
  const node = gainAt(ctx, level);

  node.connect(to);

  return node;
}

/** The master gain feeding a compressor and then a limiter into the speakers. */
function masterChain(ctx: AudioContext, muted: boolean): GainNode {
  const comp = compressor(ctx, COMPRESSOR);
  const limiter = compressor(ctx, LIMITER);

  comp.connect(limiter).connect(ctx.destination);

  return gainTo(ctx, muted ? 0 : MASTER_LEVEL, comp);
}

function whiteNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(
    1,
    ctx.sampleRate * NOISE_SECONDS,
    ctx.sampleRate,
  );
  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  return buffer;
}

/** A generated-noise impulse response: noise that fades away. */
function reverbImpulse(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * REVERB_SECONDS);
  const ir = ctx.createBuffer(REVERB_CHANNELS, len, ctx.sampleRate);

  for (let ch = 0; ch < REVERB_CHANNELS; ch++) {
    const d = ir.getChannelData(ch);

    for (let i = 0; i < len; i++) {
      d[i] =
        (Math.random() * 2 - 1) * Math.pow(1 - i / len, REVERB_DECAY_POWER);
    }
  }

  return ir;
}

/** The convolver reverb, returning into the master, with a send from each bus. */
function addReverb(ctx: AudioContext, master: GainNode, buses: Graph): void {
  const ir = reverbImpulse(ctx);
  const reverb = ctx.createConvolver();

  reverb.buffer = ir;
  reverb.connect(gainAt(ctx, REVERB_RETURN_LEVEL)).connect(master);
  buses.musicBus.connect(gainAt(ctx, MUSIC_REVERB_SEND)).connect(reverb);
  buses.sfxBus.connect(gainAt(ctx, SFX_REVERB_SEND)).connect(reverb);
}

/** The audio context, or null where there is no Web Audio or the browser will not make one. */
export function openContext(): AudioContext | null {
  const Ctor =
    typeof AudioContext === "undefined"
      ? globalThis.webkitAudioContext
      : AudioContext;

  if (!Ctor) {
    return null;
  }

  try {
    return new Ctor({ latencyHint: "interactive" });
  } catch {
    return null;
  }
}

export function buildGraph(ctx: AudioContext, muted: boolean): Graph {
  const master = masterChain(ctx, muted);
  const musicBus = gainTo(ctx, MUSIC_LEVEL, master);
  const sfxBus = gainTo(ctx, SFX_LEVEL, master);
  const graph = { master, musicBus, sfxBus, noise: whiteNoise(ctx) };

  addReverb(ctx, master, graph);

  return graph;
}
