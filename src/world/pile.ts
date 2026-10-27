// The pile of spaghetti the bugs leave behind when player 1 loses (G04 W3): strands, a meatball, garnish and a white flag. Moved out of
// world.ts as it was; it builds from fixed seeds and takes nothing from the world.
import * as THREE from "three";
import { PILE } from "#root/src/world/palette.ts";
import { kit, rng, toon } from "#root/src/world/toon.ts";
import { RANDOM_CENTRE } from "#root/src/world/world-shared.ts";

const PILE_SEED = 42;
const PILE_STRANDS = 26;
const PILE_POINTS = 6;
const PILE_SPREAD = 2.4;
const PILE_PEAK_POINT = 3;
const PILE_PEAK_FALLOFF = 4;
const PILE_CENTRE_Z = -1.2;
const PILE_Z_BIAS = 0.2;
const PILE_TUBE_SEGMENTS = 40;
const PILE_TUBE_RADIUS = 0.09;
const PILE_TUBE_SIDES = 6;
const PILE_PALE_EVERY = 3;
const PILE_OUTLINE = 0.02;
const MEATBALL_X = 0.2;
const MEATBALL_Y = 0.75;
const MEATBALL_Z = -0.9;
const MEATBALL_RADIUS = 0.7;
const MEATBALL_FLATTEN = 0.3;
const MEATBALL_STRETCH = 0.6;
const GARNISH_Y = 0.95;
const GARNISH_RADIUS = 0.22;
const GARNISH_A_X = 0.5;
const GARNISH_A_Z = -0.6;
const GARNISH_B_X = -0.2;
const GARNISH_B_Z = -1.2;
const GARNISH_C_X = 0.1;
const GARNISH_C_Z = -0.3;
const FLAG_POLE_X = -0.6;
const FLAG_POLE_Y = 1.2;
const FLAG_POLE_Z = -0.4;
const FLAG_POLE_RADIUS = 0.03;
const FLAG_POLE_LENGTH = 1.6;
const FLAG_X = -0.35;
const FLAG_Y = 1.8;
const FLAG_Z = -0.4;
const FLAG_WIDTH = 0.5;
const FLAG_HEIGHT = 0.32;
const FLAG_THICKNESS = 0.02;
const FLAG_TURN = 0.2;

function addStrands(pile: THREE.Group) {
  const r = rng(PILE_SEED);

  for (let i = 0; i < PILE_STRANDS; i++) {
    const pts: THREE.Vector3[] = [];

    for (let k = 0; k < PILE_POINTS; k++) {
      pts.push(
        new THREE.Vector3(
          (r() - RANDOM_CENTRE) * PILE_SPREAD,
          r() * 1.0 * (1 - Math.abs(k - PILE_PEAK_POINT) / PILE_PEAK_FALLOFF),
          PILE_CENTRE_Z + (r() - PILE_Z_BIAS) * PILE_SPREAD,
        ),
      );
    }

    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts),
        PILE_TUBE_SEGMENTS,
        PILE_TUBE_RADIUS,
        PILE_TUBE_SIDES,
      ),
      toon(i % PILE_PALE_EVERY ? PILE.strandPale : PILE.strand),
    );

    tube.castShadow = true;
    pile.add(tube);
  }
}

function addProps(pile: THREE.Group) {
  const a = kit(PILE_OUTLINE);

  a.ball(
    pile,
    PILE.meatball,
    MEATBALL_X,
    MEATBALL_Y,
    MEATBALL_Z,
    MEATBALL_RADIUS,
    MEATBALL_FLATTEN,
    MEATBALL_STRETCH,
  );
  for (const [x, z] of [
    [GARNISH_A_X, GARNISH_A_Z],
    [GARNISH_B_X, GARNISH_B_Z],
    [GARNISH_C_X, GARNISH_C_Z],
  ] as const) {
    a.ball(pile, PILE.garnish, x, GARNISH_Y, z, GARNISH_RADIUS);
  }

  // A white flag of surrender poking out.
  a.cyl(
    pile,
    PILE.flagPole,
    FLAG_POLE_X,
    FLAG_POLE_Y,
    FLAG_POLE_Z,
    FLAG_POLE_RADIUS,
    FLAG_POLE_LENGTH,
  );

  const flag = a.box(
    pile,
    PILE.flag,
    FLAG_X,
    FLAG_Y,
    FLAG_Z,
    FLAG_WIDTH,
    FLAG_HEIGHT,
    FLAG_THICKNESS,
  );

  flag.rotation.y = FLAG_TURN;
}

export function makePile() {
  const pile = new THREE.Group();

  pile.name = "spaghetti-pile";
  addStrands(pile);
  addProps(pile);

  return pile;
}
