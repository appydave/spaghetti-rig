import * as THREE from "three";
import { Debris } from "#root/src/world/combat/physics.ts";
import { INK, toon } from "#root/src/world/models/toon.ts";
import { kit } from "#root/src/world/models/kit/kit.ts";
import {
  EYE_WHITE,
  PALETTE,
  SLAB_TOON,
  type Mood,
} from "#root/src/world/palette.ts";
import { HEADER } from "#root/src/world/code-window/paint/card-measure.ts";
import { paintCracks } from "#root/src/world/code-window/glass/cracks.ts";
import {
  shatterWindow,
  type ShatterOptions,
} from "#root/src/world/code-window/glass/shards.ts";
import {
  extrudeMapped,
  slabShape,
} from "#root/src/world/code-window/glass/slab.ts";
import { nth } from "#root/src/nth.ts";
import { RANDOM_CENTRE } from "#root/src/world/world-shared.ts";

export { PALETTE } from "#root/src/world/palette.ts";
export type { Mood } from "#root/src/world/palette.ts";

/** The blink clock starts at a random time up to this many seconds in, so windows do not blink together. */
const BLINK_PHASE_RANGE = 10;
/** The slab is at least this thick, or this share of its width; its corners are this share of its shorter side; its bevel is this big. */
const MIN_DEPTH = 0.16;
const DEPTH_SHARE = 0.04;
const CORNER_SHARE = 0.035;
const SLAB_BEVEL = 0.02;
/** The eyes: outline thickness, largest size, share of the window width, how many sizes in from the right edge, how far down the header. */
const EYE_OUTLINE = 0.012;
const MAX_EYE_SIZE = 1.4;
const EYE_SIZE_SHARE = 0.09;
const EYE_EDGE_INSET = 1.5;
const EYE_HEADER_SHARE = 0.55;
/** The eyes float this far in front of the slab. */
const EYE_LIFT = 0.02;
/** Each eye's parts, as shares of the eye size. White: sideways offset (the brow shares it), width, height, depth. */
const EYE_SPACING = 0.42;
const WHITE_WIDTH = 0.3;
const WHITE_HEIGHT = 0.24;
const WHITE_DEPTH = 0.12;
/** Pupil: sideways offset, drop, forward offset, width, height, depth. */
const PUPIL_SPACING = 0.38;
const PUPIL_DROP = 0.03;
const PUPIL_FORWARD = 0.1;
const PUPIL_WIDTH = 0.12;
const PUPIL_HEIGHT = 0.12;
const PUPIL_DEPTH = 0.05;
/** Brow: height above the eye, forward offset, length, thickness, depth, and its angry tilt in radians. */
const BROW_RAISE = 0.24;
const BROW_FORWARD = 0.12;
const BROW_LENGTH = 0.48;
const BROW_THICKNESS = 0.1;
const BROW_DEPTH = 0.08;
const BROW_TILT = 0.45;
/** Each crack adds this to the seed so no two cracks on a window match. */
const CRACK_SEED_STEP = 31;
/** The blink: how fast its clock runs, how high the sine must reach to blink, and how squashed the eyes get. */
const BLINK_RATE = 0.9;
const BLINK_THRESHOLD = 0.985;
const BLINK_SQUASH = 0.15;
/** A rattling window shakes up to this far (scaled by its rattle). */
const RATTLE_RANGE = 0.04;

/** A chunky 3D editor window: thick slab, painted face, optional angry eyes. */
export class CodeWindow {
  readonly group = new THREE.Group();
  readonly face: THREE.MeshBasicMaterial;
  readonly side: THREE.MeshToonMaterial;
  readonly texture: THREE.CanvasTexture;
  readonly w: number;
  readonly h: number;
  readonly depth: number;
  eyes?: THREE.Group;
  private cracks = 0;
  private t = Math.random() * BLINK_PHASE_RANGE;
  rattle = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    worldWidth: number,
    readonly mood: Mood,
    opts: { maxHeight?: number; depth?: number; eyes?: boolean } = {},
  ) {
    let w = worldWidth;
    let h = (worldWidth * canvas.height) / canvas.width;

    if (opts.maxHeight && h > opts.maxHeight) {
      w *= opts.maxHeight / h;
      h = opts.maxHeight;
    }

    this.w = w;
    this.h = h;
    this.depth = opts.depth ?? Math.max(MIN_DEPTH, w * DEPTH_SHARE);
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.face = new THREE.MeshBasicMaterial({
      map: this.texture,
      toneMapped: false,
    });
    this.side = new THREE.MeshToonMaterial({
      color: PALETTE[mood].side,
      gradientMap: toon(SLAB_TOON).gradientMap,
    });

    const geo = extrudeMapped(
      slabShape(w, h, Math.min(w, h) * CORNER_SHARE),
      this.depth,
      { w, h },
      SLAB_BEVEL,
    );
    const slab = new THREE.Mesh(geo, [this.face, this.side]);

    slab.name = "code-slab";
    slab.castShadow = true;
    slab.receiveShadow = false;
    this.group.add(slab);
    this.group.name = `code-window-${mood}`;
    if ((mood === "angry" || mood === "boss") && opts.eyes !== false) {
      this.addEyes();
    }
  }

  private addEyes() {
    const a = kit(EYE_OUTLINE);
    const eyes = new THREE.Group();
    const s = Math.min(MAX_EYE_SIZE, this.w * EYE_SIZE_SHARE);
    const headerH = (HEADER / this.canvas.height) * this.h;

    eyes.position.set(
      this.w / 2 - s * EYE_EDGE_INSET,
      this.h / 2 - headerH * EYE_HEADER_SHARE,
      this.depth / 2 + EYE_LIFT,
    );
    for (const side of [-1, 1]) {
      a.ball(
        eyes,
        EYE_WHITE,
        side * s * EYE_SPACING,
        0,
        0,
        s * WHITE_WIDTH,
        s * WHITE_HEIGHT,
        s * WHITE_DEPTH,
      );

      const pupil = a.ball(
        eyes,
        INK,
        side * s * PUPIL_SPACING,
        -s * PUPIL_DROP,
        s * PUPIL_FORWARD,
        s * PUPIL_WIDTH,
        s * PUPIL_HEIGHT,
        s * PUPIL_DEPTH,
        false,
      );

      pupil.name = "pupil";

      const brow = a.box(
        eyes,
        INK,
        side * s * EYE_SPACING,
        s * BROW_RAISE,
        s * BROW_FORWARD,
        s * BROW_LENGTH,
        s * BROW_THICKNESS,
        s * BROW_DEPTH,
      );

      brow.rotation.z = side * -BROW_TILT;
    }

    this.eyes = eyes;
    this.group.add(eyes);
  }

  /** Repaint the face (e.g. the crack overlay). */
  refresh() {
    this.texture.needsUpdate = true;
  }

  crack(seed = 1, u?: number, v?: number) {
    this.cracks++;
    paintCracks(
      this.canvas,
      seed + this.cracks * CRACK_SEED_STEP,
      u === undefined ? undefined : u * this.canvas.width,
      v === undefined ? undefined : (1 - v) * this.canvas.height,
    );
    this.refresh();
  }

  update(dt: number) {
    this.t += dt;
    if (this.eyes) {
      const blink =
        Math.sin(this.t * BLINK_RATE) > BLINK_THRESHOLD ? BLINK_SQUASH : 1;

      this.eyes.scale.y = blink;
    }

    if (this.rattle > 0) {
      nth(this.group.children, 0, "window group children").position.set(
        (Math.random() - RANDOM_CENTRE) * RATTLE_RANGE * this.rattle,
        (Math.random() - RANDOM_CENTRE) * RATTLE_RANGE * this.rattle,
        0,
      );
    }
  }

  /**
   * Break into jagged physical pieces that keep their bit of the code on their face.
   * The window's own group is removed; the pieces belong to the debris world.
   */
  shatter(debris: Debris, from: THREE.Vector3, opts: ShatterOptions = {}) {
    shatterWindow(this, debris, from, opts);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.geometry.userData.shared) {
        o.geometry.dispose();
      }
    });
    if (!this.face.userData.refs) {
      this.texture.dispose();
      this.face.dispose();
      this.side.dispose();
    }

    this.group.removeFromParent();
  }
}
