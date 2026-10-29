// A random vector for the world's shakes and spins (G13 A1). Moved out of world-shared.ts as it was.
import * as THREE from "three";

export const RANDOM_CENTRE = 0.5;
/** A random vector with each component within half of `size` either side of zero (a camera shake, a debris spin). */
export const randomSpread = (size: number) =>
  new THREE.Vector3(
    (Math.random() - RANDOM_CENTRE) * size,
    (Math.random() - RANDOM_CENTRE) * size,
    (Math.random() - RANDOM_CENTRE) * size,
  );
