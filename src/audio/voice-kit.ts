/** What every synthesised voice shares: the quietest a ramp may reach, the pause before a source stops, a random draw, the noise voice and the cleanup. */

/** The quietest a gain ramp may reach: an exponential ramp cannot end at 0. */
export const SILENCE = 0.0001;
/** An oscillator or noise source is stopped this long after its gain has died away. */
export const STOP_PADDING = 0.02;

export const rand = (a: number, b: number): number =>
  a + Math.random() * (b - a);

/** Wire cleanup: when the first source ends, disconnect everything. */
export function cleanup(
  src: AudioScheduledSourceNode,
  nodes: AudioNode[],
): void {
  src.onended = () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  };
}

/** A source playing the noise buffer, and the filter of this type it will play through. */
export function noiseVoice(
  ctx: AudioContext,
  buf: AudioBuffer,
  type: BiquadFilterType,
) {
  const src = ctx.createBufferSource();

  src.buffer = buf;

  const f = ctx.createBiquadFilter();

  f.type = type;

  return { src, f };
}
