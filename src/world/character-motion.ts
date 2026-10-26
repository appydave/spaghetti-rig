// A character's per-frame animation (After-G04 A2a): the pose's gait, the fall, the aim easing and the recoil. Moved out of characters.ts as it was;
// the numbers it reads are CHARACTER_MOTION in characters.ts (the model file, where the model's other numbers live), and this file holds none.
import type { Character, Pose } from "./characters";
import { lerp } from "./toon";

/** How fast a shot's kick dies away, per second. */
const RECOIL_DECAY = 6;
/** How fast a hit's flinch dies away, per second. */
const HURT_DECAY = 2.2;
/** How quickly the aim eases towards its target, per second. */
const AIM_EASE = 10;

/** The pose-independent state the animation keeps between frames. */
export interface MotionState {
  t: number;
  recoil: number;
  hurtKick: number;
  downT: number;
  aimYaw: number;
  aimPitch: number;
  targetYaw: number;
  targetPitch: number;
}

export const newMotionState = (): MotionState => ({
  t: 0,
  recoil: 0,
  hurtKick: 0,
  downT: 0,
  aimYaw: 0,
  aimPitch: 0,
  targetYaw: 0,
  targetPitch: 0,
});

/** The numbers of the animation: one group per pose, the fall, and how the upper body is put together. Read by stepCharacter. */
export interface CharacterMotion {
  walk: { rate: number; legSwing: number; bob: number; lean: number };
  idle: { bobRate: number; bob: number; tiltRate: number; tilt: number };
  hurt: {
    bobRate: number;
    bob: number;
    lean: number;
    tilt: number;
    tiltRate: number;
    tiltSwing: number;
  };
  victory: { rate: number; bob: number; armUp: number; tilt: number };
  fall: {
    riseRate: number;
    getUpRate: number;
    curve: number;
    quarterTurn: number;
    restTilt: number;
    sink: number;
    bounce: number;
  };
  body: {
    hipsHeight: number;
    pitchLean: number;
    hurtLean: number;
    recoilLift: number;
    armLean: number;
    yawFollow: number;
    hurtShakeRate: number;
    hurtShake: number;
    headHurt: number;
    headNodRate: number;
    headNod: number;
    weaponPitch: number;
    weaponRecoil: number;
    weaponArm: number;
    weaponKick: number;
  };
}

interface Gait {
  legSwing: number;
  bob: number;
  lean: number;
  headTilt: number;
  armUp: number;
}

const STILL: Gait = { legSwing: 0, bob: 0, lean: 0, headTilt: 0, armUp: 0 };

/** How a pose moves the body at time t. */
function gaitOf(pose: Pose, t: number, m: CharacterMotion): Gait {
  switch (pose) {
    case "walk":
      return {
        ...STILL,
        legSwing: Math.sin(t * m.walk.rate) * m.walk.legSwing,
        bob: Math.abs(Math.cos(t * m.walk.rate)) * m.walk.bob,
        lean: m.walk.lean,
      };
    case "idle":
    case "aim":
      return {
        ...STILL,
        bob: Math.sin(t * m.idle.bobRate) * m.idle.bob,
        headTilt: Math.sin(t * m.idle.tiltRate) * m.idle.tilt,
      };
    case "hurt":
      return {
        ...STILL,
        bob: Math.sin(t * m.hurt.bobRate) * m.hurt.bob,
        lean: m.hurt.lean,
        headTilt:
          m.hurt.tilt + Math.sin(t * m.hurt.tiltRate) * m.hurt.tiltSwing,
      };
    case "victory":
      return {
        ...STILL,
        bob: Math.abs(Math.sin(t * m.victory.rate)) * m.victory.bob,
        armUp: m.victory.armUp,
        headTilt: m.victory.tilt,
      };
    case "down":
      return STILL;
  }
}

/** The fall onto the back: how far down the character is (0 to 1), and the tilt and height that gives the root. */
function fallOf(c: Character, dt: number, m: CharacterMotion) {
  const s = c.motion;

  s.downT =
    c.pose === "down"
      ? Math.min(1, s.downT + dt * m.fall.riseRate)
      : Math.max(0, s.downT - dt * m.fall.getUpRate);

  const fall = s.downT < 1 ? 1 - Math.pow(1 - s.downT, m.fall.curve) : 1;
  const tilt = fall * (Math.PI * m.fall.quarterTurn - m.fall.restTilt);
  const falling = s.downT > 0 && s.downT < 1;
  const y =
    fall * m.fall.sink +
    (falling ? Math.sin(s.downT * Math.PI) * m.fall.bounce : 0);

  return { tilt, y };
}

/** Put the upper body, head and weapon where the gait, the aim and the kicks say. */
function poseUpper(c: Character, g: Gait, m: CharacterMotion) {
  const s = c.motion;
  const b = m.body;
  const hurt = s.hurtKick;

  c.upper.rotation.x =
    -g.lean +
    s.aimPitch * b.pitchLean -
    hurt * b.hurtLean +
    s.recoil * b.recoilLift -
    g.armUp * b.armLean;
  c.upper.rotation.y =
    s.aimYaw * b.yawFollow +
    Math.sin(hurt * b.hurtShakeRate) * hurt * b.hurtShake;
  c.head.rotation.x = -g.headTilt - hurt * b.headHurt;
  c.head.rotation.z = Math.sin(s.t * b.headNodRate) * b.headNod;
  c.weapon.rotation.x =
    s.aimPitch * b.weaponPitch +
    s.recoil * b.weaponRecoil +
    g.armUp * b.weaponArm;
  c.weapon.position.z = s.recoil * b.weaponKick;
}

/** One frame of a character's animation. */
export function stepCharacter(c: Character, dt: number, m: CharacterMotion) {
  const s = c.motion;

  s.t += dt;
  s.recoil = Math.max(0, s.recoil - dt * RECOIL_DECAY);
  s.hurtKick = Math.max(0, s.hurtKick - dt * HURT_DECAY);

  const k = 1 - Math.exp(-dt * AIM_EASE);

  s.aimYaw = lerp(s.aimYaw, s.targetYaw, k);
  s.aimPitch = lerp(s.aimPitch, s.targetPitch, k);

  const g = gaitOf(c.pose, s.t, m);
  const fall = fallOf(c, dt, m);

  c.legL.rotation.x = g.legSwing;
  c.legR.rotation.x = -g.legSwing;
  c.hips.position.y = m.body.hipsHeight + g.bob;
  c.root.rotation.x = fall.tilt; // falls on their back
  c.root.position.y = fall.y;
  poseUpper(c, g, m);
}
