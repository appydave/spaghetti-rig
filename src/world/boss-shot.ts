// The boss fight's camera (G04 W2): how far behind the character the boss stands, where the camera sits over the shoulder, and what it
// looks at. Moved out of camera-rig.ts as it was; the picture shape comes in as a number instead of the rig's own field.
import * as THREE from "three";
import type { BossLayout } from "#root/src/world/bosslayout.ts";
import {
  BOSS,
  SCREEN_MIDDLE,
  TALL_ASPECT_BELOW,
  USABLE_WIDTH_FRACTION,
} from "#root/src/world/world-shared.ts";

const BOSS_EYE_X_TALL = 1.7;
const BOSS_EYE_X_WIDE = 4.3;
const BOSS_EYE_Y_TALL = 2.95;
const BOSS_EYE_Y_WIDE = 2.0;
const BOSS_EYE_Z_TALL = 7.4;
const BOSS_EYE_Z_WIDE = 8.0;
const BAND_TOP_TALL = 0.245;
const BAND_BOTTOM_TALL = 0.615;
const BAND_TOP_WIDE = 0.28;
const BAND_BOTTOM_WIDE = 0.72;
const BOSS_FIT_MARGIN = 0.8;
const BOSS_BACK_MIN = 12;
const BOSS_LOOK_SWAY = 0.15;

/** Where the camera stands, relative to the character, in the boss fight: close behind and to one side. */
function bossEye(aspect: number) {
  const tall = aspect < TALL_ASPECT_BELOW;

  return new THREE.Vector3(
    tall ? BOSS_EYE_X_TALL : BOSS_EYE_X_WIDE,
    tall ? BOSS_EYE_Y_TALL : BOSS_EYE_Y_WIDE,
    tall ? BOSS_EYE_Z_TALL : BOSS_EYE_Z_WIDE,
  );
}

/** The boss's band on screen, as fractions from the top: under the HUD, above the character. */
function bossBand(aspect: number) {
  return aspect < TALL_ASPECT_BELOW
    ? { top: BAND_TOP_TALL, bottom: BAND_BOTTOM_TALL }
    : { top: BAND_TOP_WIDE, bottom: BAND_BOTTOM_WIDE };
}

/** How far beyond the character the boss stands, so that all of it fits its band in this lane. */
export function bossBack(L: BossLayout, fov: number, aspect: number) {
  const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const band = bossBand(aspect);
  const distH = (L.top - L.bottom) / ((band.bottom - band.top) * 2 * t);
  const distW =
    (L.width + BOSS_FIT_MARGIN) / (USABLE_WIDTH_FRACTION * 2 * t * aspect);

  return Math.max(BOSS_BACK_MIN, Math.max(distH, distW) - bossEye(aspect).z);
}

/**
 * Boss fight: over the character's shoulder. The whole boss (head, main window and every part)
 * fits the band between the HUD and the character's head; the character stands big in the
 * foreground, off to one side so they never cover a part.
 */
export function bossShot(
  c: THREE.Vector3,
  L: BossLayout,
  fov: number,
  aspect: number,
) {
  const back = bossBack(L, fov, aspect);
  const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const band = bossBand(aspect);
  const pos = c.clone().add(bossEye(aspect));
  const centre = new THREE.Vector3(
    0,
    BOSS.y + (L.top + L.bottom) / 2,
    c.z - back,
  );
  const d = pos.z - centre.z;
  // Aim below the boss's centre so it sits in its band, not in the middle of the screen.
  const lower = (SCREEN_MIDDLE - (band.top + band.bottom) / 2) * 2 * d * t;
  const look = new THREE.Vector3(
    pos.x * BOSS_LOOK_SWAY,
    centre.y - lower,
    centre.z,
  );

  return { pos, look };
}
