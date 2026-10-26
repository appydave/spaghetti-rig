// The tool card as a projectile (G04 W6): a small glowing yellow card. Moved out of world.ts; toolBolt is split into painting the card and
// building its mesh and light, and nothing else changes.
import * as THREE from "three";
import { context2d } from "../dom";
import { beforeParen } from "../ui/card";
import { BOLT } from "./palette";

const BOLT_WIDTH = 256;
const BOLT_HEIGHT = 340;
const BOLT_CORNER = 22;
const BOLT_BORDER = 12;
const BOLT_INSET = 8;
/** The card's inner frame sits BOLT_INSET in from each edge, so it is this much smaller than the card. */
const BOLT_INNER_WIDTH = BOLT_WIDTH - BOLT_INSET * 2;
const BOLT_INNER_HEIGHT = BOLT_HEIGHT - BOLT_INSET * 2;
/** The words are centred on the card. */
const BOLT_TEXT_X = BOLT_WIDTH / 2;
const BOLT_INNER_CORNER = 16;
const BOLT_TEXT_LINES = 3;
const BOLT_TEXT_TOP = 130;
const BOLT_TEXT_LINE = 52;
const BOLT_PLANE_HEIGHT = 1.33;
const BOLT_LIGHT_INTENSITY = 4;
const BOLT_LIGHT_RANGE = 6;

/** The tool card as a projectile: a small glowing yellow card. */
export function toolBolt(name: string) {
  const group = new THREE.Group();
  const cv = paintBolt(name);
  const tex = new THREE.CanvasTexture(cv);

  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, BOLT_PLANE_HEIGHT),
    mat,
  );

  group.add(mesh);

  const light = new THREE.PointLight(
    BOLT.light,
    BOLT_LIGHT_INTENSITY,
    BOLT_LIGHT_RANGE,
  );

  group.add(light);

  return {
    group,
    dispose: () => {
      tex.dispose();
      mat.dispose();
      mesh.geometry.dispose();
      group.removeFromParent();
    },
  };
}

function paintBolt(name: string) {
  const cv = document.createElement("canvas");

  cv.width = BOLT_WIDTH;
  cv.height = BOLT_HEIGHT;

  const g = context2d(cv);

  g.fillStyle = BOLT.card;
  g.beginPath();
  g.roundRect(0, 0, BOLT_WIDTH, BOLT_HEIGHT, BOLT_CORNER);
  g.fill();
  g.strokeStyle = BOLT.border;
  g.lineWidth = BOLT_BORDER;
  g.beginPath();
  g.roundRect(
    BOLT_INSET,
    BOLT_INSET,
    BOLT_INNER_WIDTH,
    BOLT_INNER_HEIGHT,
    BOLT_INNER_CORNER,
  );
  g.stroke();
  g.fillStyle = BOLT.text;
  g.font = "italic 800 46px Barlow, Impact, sans-serif";
  g.textAlign = "center";
  for (const [i, w] of beforeParen(name)
    .split(" ")
    .slice(0, BOLT_TEXT_LINES)
    .entries()) {
    g.fillText(w, BOLT_TEXT_X, BOLT_TEXT_TOP + i * BOLT_TEXT_LINE);
  }

  return cv;
}
