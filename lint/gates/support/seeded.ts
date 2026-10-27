const INCREMENT = 0x6d2b79f5;
const FIRST_SHIFT = 15;
const SECOND_SHIFT = 7;
const THIRD_SHIFT = 14;
const SECOND_MIX = 61;
const UINT32_RANGE = 4294967296;

/** A small repeatable random number generator (mulberry32): the same seed gives the same sequence on every machine. */
export function seeded(seed: number): () => number {
  let s = seed;

  return () => {
    s = (s + INCREMENT) >>> 0;

    let t = Math.imul(s ^ (s >>> FIRST_SHIFT), 1 | s);

    t = (t + Math.imul(t ^ (t >>> SECOND_SHIFT), SECOND_MIX | t)) ^ t;

    return ((t ^ (t >>> THIRD_SHIFT)) >>> 0) / UINT32_RANGE;
  };
}
