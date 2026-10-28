import * as THREE from "three";
import { WORLD } from "#root/src/world/palette.ts";

const FOG_NEAR = 40;
const FOG_FAR = 120;
const HEMISPHERE_INTENSITY = 2.2;
const SUN_INTENSITY = 2.9;
const SHADOW_MAP_SIZE = 2048;
const SHADOW_EXTENT = 28;
const SHADOW_CAMERA_FAR = 120;
const SHADOW_BIAS = -0.0004;
const SHADOW_NORMAL_BIAS = 0.04;
const SHADOW_BLUR_RADIUS = 3;
const RIM_INTENSITY = 1.1;
const RIM_X = -30;
const RIM_Y = 20;
const RIM_Z = -40;
const SUN_OFFSET_X = 14;
const SUN_HEIGHT = 30;
const SUN_OFFSET_Z = 16;
const SUN_TARGET_AHEAD = 8;

/** Sky, fog, the hemisphere fill, the shadow-casting sun and the rim light. Returns the sun, which follows the action. */
export function lightScene(scene: THREE.Scene): THREE.DirectionalLight {
  scene.background = new THREE.Color(WORLD.sky);
  scene.fog = new THREE.Fog(WORLD.fog, FOG_NEAR, FOG_FAR);
  scene.add(
    new THREE.HemisphereLight(
      WORLD.hemisphereSky,
      WORLD.hemisphereGround,
      HEMISPHERE_INTENSITY,
    ),
  );

  const sun = new THREE.DirectionalLight(WORLD.sun, SUN_INTENSITY);

  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);

  const sc = sun.shadow.camera;

  sc.left = -SHADOW_EXTENT;
  sc.right = SHADOW_EXTENT;
  sc.top = SHADOW_EXTENT;
  sc.bottom = -SHADOW_EXTENT;
  sc.near = 1;
  sc.far = SHADOW_CAMERA_FAR;
  sun.shadow.bias = SHADOW_BIAS;
  sun.shadow.normalBias = SHADOW_NORMAL_BIAS;
  sun.shadow.radius = SHADOW_BLUR_RADIUS;
  scene.add(sun, sun.target);

  const rim = new THREE.DirectionalLight(WORLD.rim, RIM_INTENSITY);

  rim.position.set(RIM_X, RIM_Y, RIM_Z);
  scene.add(rim);

  return sun;
}

/** Keep the sun's shadow box centred on the action. */
export function followWithSun(sun: THREE.DirectionalLight, c: THREE.Vector3) {
  sun.position.set(c.x - SUN_OFFSET_X, SUN_HEIGHT, c.z + SUN_OFFSET_Z);
  sun.target.position.set(c.x, 0, c.z - SUN_TARGET_AHEAD);
}
