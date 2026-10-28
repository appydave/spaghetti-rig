import * as THREE from "three";

const CAMERA_FOV = 42;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 400;
const WIDESCREEN_WIDTH = 16;
const WIDESCREEN_HEIGHT = 9;
/** The picture shape a player lane starts with, before the real window size is known. */
const WIDESCREEN = WIDESCREEN_WIDTH / WIDESCREEN_HEIGHT;

export function makeCamera() {
  return new THREE.PerspectiveCamera(
    CAMERA_FOV,
    WIDESCREEN,
    CAMERA_NEAR,
    CAMERA_FAR,
  );
}
