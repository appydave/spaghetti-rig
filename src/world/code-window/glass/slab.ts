import * as THREE from "three";
import { nth } from "#root/src/nth.ts";

/** How finely the slab's rounded corners are cut. */
const CURVE_SEGMENTS = 5;
/** A texture coordinate is a position over the window's size, plus this to move the centre to the middle of the 0..1 range. */
const UV_CENTRE = 0.5;

/** The window's width and height in world units. */
export interface Size {
  w: number;
  h: number;
}

/** Rounded rectangle outline used for the slab. */
export function slabShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();

  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);

  return s;
}

/** Extrude a shape and map its caps onto the window's texture by absolute position. */
export function extrudeMapped(
  shape: THREE.Shape,
  depth: number,
  size: Size,
  bevel: number,
) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: CURVE_SEGMENTS,
    steps: 1,
  });

  geo.translate(0, 0, -depth / 2);

  const pos = geo.getAttribute("position");
  const uv = geo.getAttribute("uv");
  const caps = nth(geo.groups, 0, "geometry groups");

  for (let i = caps.start; i < caps.start + caps.count; i++) {
    uv.setXY(
      i,
      pos.getX(i) / size.w + UV_CENTRE,
      pos.getY(i) / size.h + UV_CENTRE,
    );
  }

  uv.needsUpdate = true;

  return geo;
}
