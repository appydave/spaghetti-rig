// Small maths the world shares: a seeded random, easing curves, clamp and lerp. Moved out of world/models/toon.ts.

const XORSHIFT_LEFT_A = 13;
const XORSHIFT_RIGHT = 17;
const XORSHIFT_LEFT_B = 5;
const UINT32_RANGE = 4294967296;
const EASE_CUBIC_POWER = 3;
const EASE_IN_HALF_SCALE = 4;
const EASE_OUT_HALF_SLOPE = -2;
const ELASTIC_PERIOD_DIVISOR = 3;
const EASE_MIDPOINT = 0.5;
const ELASTIC_DECAY = -10;
const ELASTIC_FREQUENCY = 10;
const ELASTIC_PHASE = 0.75;
const OVERSHOOT = 1.70158;

/** Seeded random, so both players' streets are identical. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;

  return () => {
    s ^= s << XORSHIFT_LEFT_A;
    s >>>= 0;
    s ^= s >>> XORSHIFT_RIGHT;
    s ^= s << XORSHIFT_LEFT_B;
    s >>>= 0;

    return s / UINT32_RANGE;
  };
}

export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, EASE_CUBIC_POWER),
  inOutCubic: (t: number) =>
    t < EASE_MIDPOINT
      ? EASE_IN_HALF_SCALE * t * t * t
      : 1 - Math.pow(EASE_OUT_HALF_SLOPE * t + 2, EASE_CUBIC_POWER) / 2,
  outBack: (t: number) => {
    const c1 = OVERSHOOT;
    const c3 = c1 + 1;

    return 1 + c3 * Math.pow(t - 1, EASE_CUBIC_POWER) + c1 * Math.pow(t - 1, 2);
  },
  inCubic: (t: number) => t * t * t,
  outElastic: (t: number) =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : Math.pow(2, ELASTIC_DECAY * t) *
            Math.sin(
              (t * ELASTIC_FREQUENCY - ELASTIC_PHASE) *
                ((2 * Math.PI) / ELASTIC_PERIOD_DIVISOR),
            ) +
          1,
};
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A random number from a up to (not including) b. */
export const rand = (a: number, b: number): number =>
  a + Math.random() * (b - a);
