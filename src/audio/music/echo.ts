/** The ping-pong dotted-eighth delay a deck sends to for width. */

const SEND_LEVEL = 0.22;
const TONE_HZ = 2800;
const DELAY_CEILING_SECONDS = 2;
const FEEDBACK = 0.4;
const PAN = 0.7;
/** The delay is at most this long, and one dotted eighth is three steps. */
const DELAY_MAX_SECONDS = 1.5;
const DELAY_STEPS = 3;

export interface Echo {
  /** Where a voice sends to be echoed. */
  input: GainNode;
  /** Every node, to disconnect when the deck is disposed. */
  nodes: AudioNode[];
}

const gain = (ctx: AudioContext, value: number): GainNode => {
  const g = ctx.createGain();

  g.gain.value = value;

  return g;
};

const delay = (ctx: AudioContext, seconds: number): DelayNode => {
  const d = ctx.createDelay(DELAY_CEILING_SECONDS);

  d.delayTime.value = seconds;

  return d;
};

const panner = (ctx: AudioContext, pan: number): StereoPannerNode => {
  const p = ctx.createStereoPanner();

  p.pan.value = pan;

  return p;
};

/** The echo, sounding into `out`, with one dotted eighth of `stepSec` between repeats. */
export function buildEcho(
  ctx: AudioContext,
  out: AudioNode,
  stepSec: number,
): Echo {
  const input = gain(ctx, SEND_LEVEL);
  const tone = ctx.createBiquadFilter();

  tone.type = "lowpass";
  tone.frequency.value = TONE_HZ;

  const seconds = Math.min(DELAY_MAX_SECONDS, stepSec * DELAY_STEPS);
  const left = delay(ctx, seconds);
  const right = delay(ctx, seconds);
  const feedbackLeft = gain(ctx, FEEDBACK);
  const feedbackRight = gain(ctx, FEEDBACK);
  const panLeft = panner(ctx, -PAN);
  const panRight = panner(ctx, PAN);

  input.connect(tone).connect(left);
  left.connect(panLeft).connect(out);
  left.connect(feedbackLeft).connect(right);
  right.connect(panRight).connect(out);
  right.connect(feedbackRight).connect(left);

  return {
    input,
    nodes: [
      input,
      tone,
      left,
      right,
      feedbackLeft,
      feedbackRight,
      panLeft,
      panRight,
    ],
  };
}
