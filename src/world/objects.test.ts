import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { isDrawable, mapOf, meshNamed, userData } from "./objects";

describe("userData", () => {
  it("returns a value of the asked-for type", () => {
    const o = new THREE.Object3D();
    const home = new THREE.Vector3(1, 2, 3);

    o.userData.home = home;
    expect(userData(o, "home", THREE.Vector3)).toBe(home);
  });

  it("throws when the value is missing or another type", () => {
    const o = new THREE.Object3D();

    o.name = "hero";
    o.userData.home = "nope";
    expect(() => userData(o, "home", THREE.Vector3)).toThrow(
      "hero.userData.home is not a Vector3",
    );
    expect(() => userData(o, "gone", THREE.Vector3)).toThrow(
      "is not a Vector3",
    );
  });
});

describe("meshNamed", () => {
  it("finds a mesh below a group", () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh();

    mesh.name = "slab";
    group.add(mesh);
    expect(meshNamed(group, "slab")).toBe(mesh);
  });

  it("throws when there is no such mesh, or it is not a mesh", () => {
    const group = new THREE.Group();
    const other = new THREE.Object3D();

    other.name = "slab";
    group.add(other);
    expect(() => meshNamed(group, "slab")).toThrow('no mesh named "slab"');
    expect(() => meshNamed(group, "gone")).toThrow('no mesh named "gone"');
  });
});

describe("isDrawable and mapOf", () => {
  it("accepts meshes, lines, points and sprites, and nothing else", () => {
    for (const o of [
      new THREE.Mesh(),
      new THREE.Line(),
      new THREE.Points(),
      new THREE.Sprite(),
    ]) {
      expect(isDrawable(o)).toBe(true);
    }

    expect(isDrawable(new THREE.Group())).toBe(false);
  });

  it("reads the map of a material that has one", () => {
    const map = new THREE.Texture();

    expect(mapOf(new THREE.MeshBasicMaterial({ map }))).toBe(map);
    expect(mapOf(new THREE.MeshBasicMaterial())).toBeNull();
    expect(mapOf(new THREE.ShadowMaterial())).toBeNull();
  });
});
