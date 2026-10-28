// The effects drawn as sprites: the muzzle flare and floating text, each a fader, and the shared glow texture. Moved out of effects.ts.
import * as THREE from "three";
import { context2d } from "#root/src/dom.ts";
import type { Fader } from "#root/src/world/combat/fx/faders.ts";
import { FX } from "#root/src/world/palette.ts";

/** How floating text looks: its colour, its height in the world and how long it floats. */
export interface TextLook {
  color: string;
  size: number;
  life: number;
}

const MUZZLE_SPRITE_SCALE = 0.7;
const MUZZLE_SPRITE_GROWTH = 0.6;
const MUZZLE_SPRITE_LIFE = 0.09;
const TEXT_CANVAS_WIDTH = 512;
const TEXT_CANVAS_HEIGHT = 160;
const TEXT_CENTRE_X = 256;
const TEXT_CENTRE_Y = 84;
const TEXT_OUTLINE_WIDTH = 16;
const TEXT_RENDER_ORDER = 50;
const TEXT_ASPECT = 3.2;
const TEXT_RISE = 0.9;
const TEXT_FADE_START = 0.7;
const TEXT_FADE_SPAN = 0.3;
const TEXT_POP_SPEED = 6;
const TEXT_POP_MIN = 0.6;
const TEXT_POP_RANGE = 0.4;
const GLOW_SIZE = 128;
const GLOW_CENTRE = 64;
const GLOW_MID_STOP = 0.3;
const GLOW_STAR_INSET = 58;
const GLOW_STAR_OUTSET = 70;

/** The muzzle's glow sprite, which swells and fades. */
export function muzzleFader(
  scene: THREE.Scene,
  at: THREE.Vector3,
  color: string,
): Fader {
  const mat = new THREE.SpriteMaterial({
    color,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    toneMapped: false,
    map: glow(),
  });
  const s = new THREE.Sprite(mat);

  s.position.copy(at);
  s.scale.setScalar(MUZZLE_SPRITE_SCALE);
  scene.add(s);

  return {
    obj: s,
    mat,
    age: 0,
    life: MUZZLE_SPRITE_LIFE,
    tick: (k, o) => {
      o.scale.setScalar(MUZZLE_SPRITE_SCALE + k * MUZZLE_SPRITE_GROWTH);
      mat.opacity = 1 - k;
    },
  };
}

/** The text painted, outlined, on a canvas texture. */
function textTexture(s: string, color: string): THREE.CanvasTexture {
  const cv = document.createElement("canvas");

  cv.width = TEXT_CANVAS_WIDTH;
  cv.height = TEXT_CANVAS_HEIGHT;

  const g = context2d(cv);

  g.font = "italic 800 120px Barlow, Impact, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = TEXT_OUTLINE_WIDTH;
  g.strokeStyle = FX.textOutline;
  g.lineJoin = "round";
  g.strokeText(s, TEXT_CENTRE_X, TEXT_CENTRE_Y);
  g.fillStyle = color;
  g.fillText(s, TEXT_CENTRE_X, TEXT_CENTRE_Y);

  const tex = new THREE.CanvasTexture(cv);

  tex.colorSpace = THREE.SRGBColorSpace;

  return tex;
}

/** Floating text in the world ("+100", "−30%"): it pops in, rises and fades. */
export function textFader(
  scene: THREE.Scene,
  at: THREE.Vector3,
  s: string,
  look: TextLook,
): Fader {
  const { color, size, life } = look;
  const mat = new THREE.SpriteMaterial({
    map: textTexture(s, color),
    transparent: true,
    depthTest: false,
    toneMapped: false,
  });
  const sp = new THREE.Sprite(mat);

  sp.renderOrder = TEXT_RENDER_ORDER;
  sp.position.copy(at);
  sp.scale.set(size * TEXT_ASPECT, size, 1);
  scene.add(sp);

  const y0 = at.y;

  return {
    obj: sp,
    mat,
    age: 0,
    life,
    tick: (k, o) => {
      o.position.y = y0 + k * TEXT_RISE;
      mat.opacity =
        k < TEXT_FADE_START ? 1 : 1 - (k - TEXT_FADE_START) / TEXT_FADE_SPAN;

      const p = Math.min(1, k * TEXT_POP_SPEED);

      o.scale.set(
        size * TEXT_ASPECT * (TEXT_POP_MIN + p * TEXT_POP_RANGE),
        size * (TEXT_POP_MIN + p * TEXT_POP_RANGE),
        1,
      );
    },
  };
}

let glowTex: THREE.CanvasTexture | undefined;

function glow() {
  if (glowTex) {
    return glowTex;
  }

  const cv = document.createElement("canvas");

  cv.width = cv.height = GLOW_SIZE;

  const g = context2d(cv);
  const grad = g.createRadialGradient(
    GLOW_CENTRE,
    GLOW_CENTRE,
    0,
    GLOW_CENTRE,
    GLOW_CENTRE,
    GLOW_CENTRE,
  );

  grad.addColorStop(0, FX.glowCore);
  grad.addColorStop(GLOW_MID_STOP, FX.glowMid);
  grad.addColorStop(1, FX.glowEdge);
  g.fillStyle = grad;
  g.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  // Four-point star flare.
  g.fillStyle = FX.glowStar;
  g.beginPath();
  g.moveTo(GLOW_CENTRE, 0);
  g.lineTo(GLOW_STAR_OUTSET, GLOW_STAR_INSET);
  g.lineTo(GLOW_SIZE, GLOW_CENTRE);
  g.lineTo(GLOW_STAR_OUTSET, GLOW_STAR_OUTSET);
  g.lineTo(GLOW_CENTRE, GLOW_SIZE);
  g.lineTo(GLOW_STAR_INSET, GLOW_STAR_OUTSET);
  g.lineTo(0, GLOW_CENTRE);
  g.lineTo(GLOW_STAR_INSET, GLOW_STAR_INSET);
  g.closePath();
  g.fill();
  glowTex = new THREE.CanvasTexture(cv);
  glowTex.userData.shared = true;

  return glowTex;
}
