import type { SfxRig } from "#root/src/audio/sfx/voices.ts";
import { SILENCE, cleanup } from "#root/src/audio/voice-kit.ts";
import { rand } from "#root/src/maths.ts";

/** The player-one shot: its pitch varies by this ratio, and it is a zap, a chirp and a thump (each: pitch, slide, length, level). */
const SHOOT_P1_PITCH_MIN = 0.93;
const SHOOT_P1_PITCH_MAX = 1.07;
const SHOOT_P1_ZAP_HZ = 2400;
const SHOOT_P1_ZAP_HZ_END = 650;
const SHOOT_P1_ZAP_DUR = 0.14;
const SHOOT_P1_ZAP_VOL = 0.09;
const SHOOT_P1_ZAP_LP = 5000;
const SHOOT_P1_CHIRP_HZ = 1500;
const SHOOT_P1_CHIRP_HZ_END = 3300;
const SHOOT_P1_CHIRP_DUR = 0.06;
const SHOOT_P1_CHIRP_VOL = 0.08;
const SHOOT_P1_THUMP_DELAY = 0.01;
const SHOOT_P1_THUMP_HZ = 320;
const SHOOT_P1_THUMP_HZ_END = 150;
const SHOOT_P1_THUMP_DUR = 0.1;
const SHOOT_P1_THUMP_VOL = 0.05;
const SHOOT_P1_THUMP_LP = 1300;
/** A robot breaking: a clunk, then a burst of sparks (each a square blip and a noise zap, a random gap apart), then a rumble. */
const ROBOT_CLUNK_HZ = 170;
const ROBOT_CLUNK_HZ_END = 55;
const ROBOT_CLUNK_DUR = 0.22;
const ROBOT_CLUNK_VOL = 0.4;
const ROBOT_SPARKS = 6;
const ROBOT_SPARK_MIN_HZ = 900;
const ROBOT_SPARK_MAX_HZ = 3400;
const ROBOT_SPARK_SLIDE = 0.96;
const ROBOT_SPARK_MIN_DUR = 0.05;
const ROBOT_SPARK_MAX_DUR = 0.13;
const ROBOT_SPARK_VOL = 0.06;
const ROBOT_SPARK_LP = 6500;
const ROBOT_ZAP_RATIO = 1.5;
const ROBOT_ZAP_Q = 9;
const ROBOT_ZAP_DUR = 0.07;
const ROBOT_ZAP_VOL = 0.35;
const ROBOT_SPARK_MIN_GAP = 0.03;
const ROBOT_SPARK_MAX_GAP = 0.07;
const ROBOT_RUMBLE_DELAY = 0.08;
const ROBOT_RUMBLE_HZ = 650;
const ROBOT_RUMBLE_HZ_END = 180;
const ROBOT_RUMBLE_DUR = 0.32;
const ROBOT_RUMBLE_VOL = 0.06;
/** The bounce: a sine that rises with a wobble that dies away, a short gain envelope, and a high click. */
const BOUNCE_HZ = 240;
const BOUNCE_HZ_END = 430;
const BOUNCE_SWEEP = 0.42;
const BOUNCE_WOBBLE_DEPTH = 150;
const BOUNCE_WOBBLE_END = 4;
const BOUNCE_PEAK = 0.28;
const BOUNCE_ATTACK = 0.01;
const BOUNCE_DECAY = 0.45;
const BOUNCE_STOP = 0.47;
const BOUNCE_CLICK_HZ = 2300;
const BOUNCE_CLICK_DUR = 0.05;
const BOUNCE_CLICK_VOL = 0.12;

/** The player-one shot effect. */
export function shootP1(rig: SfxRig, out: AudioNode, t: number): void {
  const { voices } = rig;

  const p = rand(SHOOT_P1_PITCH_MIN, SHOOT_P1_PITCH_MAX);

  voices.tone(out, t, {
    type: "square",
    f: SHOOT_P1_ZAP_HZ * p,
    f2: SHOOT_P1_ZAP_HZ_END * p,
    dur: SHOOT_P1_ZAP_DUR,
    vol: SHOOT_P1_ZAP_VOL,
    lp: SHOOT_P1_ZAP_LP,
  });
  voices.tone(out, t, {
    type: "triangle",
    f: SHOOT_P1_CHIRP_HZ * p,
    f2: SHOOT_P1_CHIRP_HZ_END * p,
    dur: SHOOT_P1_CHIRP_DUR,
    vol: SHOOT_P1_CHIRP_VOL,
  });
  voices.tone(out, t + SHOOT_P1_THUMP_DELAY, {
    type: "sawtooth",
    f: SHOOT_P1_THUMP_HZ * p,
    f2: SHOOT_P1_THUMP_HZ_END * p,
    dur: SHOOT_P1_THUMP_DUR,
    vol: SHOOT_P1_THUMP_VOL,
    lp: SHOOT_P1_THUMP_LP,
  });
}

/** The robot breaking effect. */
export function robotBreak(rig: SfxRig, out: AudioNode, t: number): void {
  const { voices } = rig;

  voices.tone(out, t, {
    type: "sine",
    f: ROBOT_CLUNK_HZ,
    f2: ROBOT_CLUNK_HZ_END,
    dur: ROBOT_CLUNK_DUR,
    vol: ROBOT_CLUNK_VOL,
  });

  let ti = t;

  for (let i = 0; i < ROBOT_SPARKS; i++) {
    const f = rand(ROBOT_SPARK_MIN_HZ, ROBOT_SPARK_MAX_HZ);

    voices.tone(out, ti, {
      type: "square",
      f,
      f2: f * ROBOT_SPARK_SLIDE,
      dur: rand(ROBOT_SPARK_MIN_DUR, ROBOT_SPARK_MAX_DUR),
      vol: ROBOT_SPARK_VOL,
      lp: ROBOT_SPARK_LP,
    });
    voices.noise(out, ti, {
      filter: "bandpass",
      f: f * ROBOT_ZAP_RATIO,
      q: ROBOT_ZAP_Q,
      dur: ROBOT_ZAP_DUR,
      vol: ROBOT_ZAP_VOL,
    });
    ti += rand(ROBOT_SPARK_MIN_GAP, ROBOT_SPARK_MAX_GAP);
  }

  voices.tone(out, t + ROBOT_RUMBLE_DELAY, {
    type: "triangle",
    f: ROBOT_RUMBLE_HZ,
    f2: ROBOT_RUMBLE_HZ_END,
    dur: ROBOT_RUMBLE_DUR,
    vol: ROBOT_RUMBLE_VOL,
  });
}

/** The bounce effect. */
export function bounce(rig: SfxRig, out: AudioNode, t: number): void {
  const { kit, voices } = rig;

  const { ctx } = kit;
  const o = ctx.createOscillator();

  o.type = "sine";
  o.frequency.setValueAtTime(BOUNCE_HZ, t);
  o.frequency.exponentialRampToValueAtTime(BOUNCE_HZ_END, t + BOUNCE_SWEEP);

  const lfo = ctx.createOscillator();

  lfo.frequency.value = 17;

  const depth = ctx.createGain();

  depth.gain.setValueAtTime(BOUNCE_WOBBLE_DEPTH, t);
  depth.gain.exponentialRampToValueAtTime(BOUNCE_WOBBLE_END, t + BOUNCE_SWEEP);
  lfo.connect(depth).connect(o.frequency);

  const g = ctx.createGain();

  g.gain.setValueAtTime(SILENCE, t);
  g.gain.exponentialRampToValueAtTime(BOUNCE_PEAK, t + BOUNCE_ATTACK);
  g.gain.exponentialRampToValueAtTime(SILENCE, t + BOUNCE_DECAY);
  o.connect(g).connect(out);
  o.start(t);
  lfo.start(t);
  o.stop(t + BOUNCE_STOP);
  lfo.stop(t + BOUNCE_STOP);
  cleanup(o, [o, lfo, depth, g]);
  voices.tone(out, t, {
    type: "triangle",
    f: BOUNCE_CLICK_HZ,
    dur: BOUNCE_CLICK_DUR,
    vol: BOUNCE_CLICK_VOL,
  });
}
