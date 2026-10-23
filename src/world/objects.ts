import * as THREE from "three";

/** Every kind of object that owns a geometry and a material. */
export type Drawable = THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite;

export const isDrawable = (o: THREE.Object3D): o is Drawable =>
  o instanceof THREE.Mesh ||
  o instanceof THREE.Line ||
  o instanceof THREE.Points ||
  o instanceof THREE.Sprite;

/** Read a value stored on an object's userData and prove its type; throws if the object was set up differently. */
export function userData<T extends object>(
  o: THREE.Object3D,
  key: string,
  type: abstract new (...args: never[]) => T,
): T {
  const value: unknown = o.userData[key];
  if (!(value instanceof type)) {
    throw new Error(
      `${o.name || o.type}.userData.${key} is not a ${type.name}`,
    );
  }
  return value;
}

/** The mesh with this name below a group; throws if it is missing or not a mesh. */
export function meshNamed(group: THREE.Object3D, name: string): THREE.Mesh {
  const found = group.getObjectByName(name);
  if (!(found instanceof THREE.Mesh)) {
    throw new Error(`${group.name || group.type} has no mesh named "${name}"`);
  }
  return found;
}

/** The colour map of a material that has one (sprite and basic materials do). */
export const mapOf = (m: THREE.Material): THREE.Texture | null =>
  "map" in m && m.map instanceof THREE.Texture ? m.map : null;
