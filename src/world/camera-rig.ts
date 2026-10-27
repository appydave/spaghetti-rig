// A player's camera (G04 W2): where it stands for each kind of shot, how it eases there, and the picture shape it is framed for. Moved out
// of world.ts as it was; the world tells it what is on screen (ShotView) instead of the rig reaching into the world.
import * as THREE from "three";
import { present } from "#root/src/nth.ts";
import { bossBack, bossShot } from "#root/src/world/boss-shot.ts";
import type { BossLayout } from "#root/src/world/bosslayout.ts";
import {
  randomSpread,
  SCREEN_MIDDLE,
  TALL_ASPECT_BELOW,
  USABLE_WIDTH_FRACTION,
  type CameraMode,
  type Shape,
} from "#root/src/world/world-shared.ts";

const CAM_START_X = 3;
const CAM_START_Y = 3;
const CAM_START_Z = 8;
const CAM_LOOK_START_Y = 1.5;
const CAM_LOOK_START_Z = -6;
const TALL_READING_Y = 2.45;
const TALL_READING_NUDGE = 0.6;
const WIDE_READING_RAISE = 0.5;
const WIDE_READING_MIN_Y = 2.3;
const WIDE_READING_GAP = 0.8;
const FOLLOW_X = 1.7;
const FOLLOW_Y = 2.6;
const FOLLOW_Z = 5.4;
const FOLLOW_LOOK_X = 0.5;
const FOLLOW_LOOK_Y = 1.7;
const FOLLOW_LOOK_Z = -9;
const TALL_NUDGE_X = -0.4;
const TALL_NUDGE_Y = 0.6;
const TALL_NUDGE_Z = 1.6;
const PORTRAIT_X = 2.8;
const PORTRAIT_Y = 2.2;
const PORTRAIT_Z = -7.2;
const PORTRAIT_LOOK_Y = 2.3;
const PILE_NUDGE_X = 0.5;
const PILE_NUDGE_Y = 1.5;
const PILE_LOOK_Y = 0.6;
const SHOT_BOX_HALF_WIDTH = 0.6;
const SHOT_BOX_WAIST_Y = 1.1;
const SHOT_BOX_BACK = 0.9;
const SHOT_BOX_TOP = 2.5;
const SHOT_MARGIN = 0.6;
const SHOT_SIDE_RATIO = 0.985;
const SHOT_RISE_RATIO = 0.05;
const SHOT_DEPTH_RATIO = 0.17;
const CAMERA_FOLLOW_RATE = 3.2;
const SHAKE_SCALE = 0.12;
const SNAP_SECONDS = 1e3;

/** What the world has on screen that the camera frames. */
export interface ShotView {
  layout: BossLayout | null;
  /** The stop's code window, if one is up. */
  window: { w: number; h: number } | null;
  /** Player 1's pile of shipped bugs is up, so the portrait shot lifts to take it in. */
  pile: boolean;
}

interface Shot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

export class CameraRig {
  aspect: number;
  shape: Shape = "wide";
  mode: CameraMode = "follow";
  private readonly pos = new THREE.Vector3(
    CAM_START_X,
    CAM_START_Y,
    CAM_START_Z,
  );
  private readonly look = new THREE.Vector3(
    0,
    CAM_LOOK_START_Y,
    CAM_LOOK_START_Z,
  );

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.aspect = camera.aspect;
  }

  /** Re-frame for a new picture shape; true when that changed the shape (wide to tall or back). */
  setAspect(aspect: number): boolean {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    const shape: Shape = aspect < TALL_ASPECT_BELOW ? "tall" : "wide";
    const changed = shape !== this.shape;

    this.shape = shape;

    return changed;
  }

  /** Where a stop window sits so the code is as big as possible, with the character beside or below it. */
  readingPose(win: { w: number; h: number }, z: number) {
    if (this.shape === "tall") {
      return {
        pos: new THREE.Vector3(
          0,
          TALL_READING_Y + win.h / 2,
          z - win.w / 2 + TALL_READING_NUDGE,
        ),
        scale: 1,
      };
    }

    return {
      pos: new THREE.Vector3(
        0,
        Math.max(WIDE_READING_RAISE + win.h / 2, WIDE_READING_MIN_Y),
        z - WIDE_READING_GAP - win.w / 2,
      ),
      scale: 1,
    };
  }

  face(o: THREE.Object3D, keepRoll = false) {
    const roll = o.rotation.z;

    o.quaternion.copy(this.camera.quaternion);
    if (keepRoll) {
      o.rotateZ(roll);
    }
  }

  /** Ease toward the shot the mode calls for, shake included, and look at it. */
  step(dt: number, c: THREE.Vector3, view: ShotView, shake: number) {
    const { pos, look } = this.shot(c, view);
    const k = 1 - Math.exp(-dt * CAMERA_FOLLOW_RATE);

    this.pos.lerp(pos, k);
    this.look.lerp(look, k);
    this.camera.position.copy(this.pos);
    if (shake > 0) {
      const s = shake * SHAKE_SCALE;

      this.camera.position.add(randomSpread(s));
    }

    this.camera.lookAt(this.look);
  }

  /** How far beyond the character the boss stands, so that all of it fits its band in this lane. */
  bossBack(L: BossLayout) {
    return bossBack(L, this.camera.fov, this.aspect);
  }

  /** Jump the camera to its target at once (after a cut). */
  snap(c: THREE.Vector3, view: ShotView, shake: number) {
    this.step(SNAP_SECONDS, c, view, shake);
  }

  private shot(c: THREE.Vector3, view: ShotView): Shot {
    if (this.mode === "follow") {
      return this.followShot(c);
    }

    if (this.mode === "boss") {
      return bossShot(
        c,
        present(view.layout, "boss layout"),
        this.camera.fov,
        this.aspect,
      );
    }

    if (this.mode === "portrait") {
      return this.portraitShot(c, view.pile);
    }

    return this.sideShot(c, view);
  }

  private followShot(c: THREE.Vector3): Shot {
    const pos = c.clone().add(new THREE.Vector3(FOLLOW_X, FOLLOW_Y, FOLLOW_Z));
    const look = c
      .clone()
      .add(new THREE.Vector3(FOLLOW_LOOK_X, FOLLOW_LOOK_Y, FOLLOW_LOOK_Z));

    if (this.aspect < TALL_ASPECT_BELOW) {
      pos.add(new THREE.Vector3(TALL_NUDGE_X, TALL_NUDGE_Y, TALL_NUDGE_Z));
    }

    return { pos, look };
  }

  /** Front three-quarter, character low in frame so the result text sits above them. */
  private portraitShot(c: THREE.Vector3, pile: boolean): Shot {
    const pos = c
      .clone()
      .add(new THREE.Vector3(PORTRAIT_X, PORTRAIT_Y, PORTRAIT_Z));
    const look = c.clone().add(new THREE.Vector3(0, PORTRAIT_LOOK_Y, 0));

    if (pile) {
      pos.add(new THREE.Vector3(PILE_NUDGE_X, PILE_NUDGE_Y, 0));
      look.y = PILE_LOOK_Y;
    }

    return { pos, look };
  }

  /** The box the side-on shot must hold: the character, plus the window. Legs may sit behind the tray; the box starts at the waist. */
  private shotBox(c: THREE.Vector3, view: ShotView) {
    const box = new THREE.Box3(
      new THREE.Vector3(
        -SHOT_BOX_HALF_WIDTH,
        SHOT_BOX_WAIST_Y,
        c.z - SHOT_BOX_BACK,
      ),
      new THREE.Vector3(SHOT_BOX_HALF_WIDTH, SHOT_BOX_TOP, c.z + 1.0),
    );

    if (this.mode === "stop" && view.window) {
      const w = view.window;
      const p = this.readingPose(w, c.z).pos;

      box
        .expandByPoint(new THREE.Vector3(0, p.y - w.h / 2, p.z - w.w / 2))
        .expandByPoint(new THREE.Vector3(0, p.y + w.h / 2, p.z + w.w / 2));
    }

    return box;
  }

  /** Side-on, like Spaghetti Busters: frame the character and the window, leaving room for the HUD. */
  private sideShot(c: THREE.Vector3, view: ShotView): Shot {
    const box = this.shotBox(c, view);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    // The HUD takes the top ~20% and the tray and captions the bottom ~24%; fit the box between them.
    const top = 0.18;
    const bottom = 0.21;
    const usableH = 1 - top - bottom;
    const usableW = USABLE_WIDTH_FRACTION;
    const t = Math.tan(fov / 2);
    const distH = size.y / usableH / 2 / t;
    const distW = size.z / usableW / 2 / t / this.aspect;
    const d = Math.max(distH, distW) + SHOT_MARGIN;
    const visibleH = 2 * d * t;
    const lift = (bottom + usableH / 2 - SCREEN_MIDDLE) * visibleH;

    return {
      look: new THREE.Vector3(0, centre.y - lift, centre.z),
      pos: new THREE.Vector3(
        d * SHOT_SIDE_RATIO,
        centre.y - lift + d * SHOT_RISE_RATIO,
        centre.z + d * SHOT_DEPTH_RATIO,
      ),
    };
  }
}
