// How a built model is fingerprinted: for every node of its scene, the world-space vertices, index count, material, light and
// transform, rolled up to one hash per node and one per model. Used by model-proof.test.ts.
import { createHash } from "node:crypto";
import * as THREE from "three";

/** Coordinates are rounded to this scale (four decimals) so float noise in the last bits cannot show. */
const DECIMALS = 1e4;
/** How many hex characters of each hash are kept. */
const NODE_HASH_CHARS = 12;
const MODEL_HASH_CHARS = 16;

type Part = { path: string; hash: string };
export type Print = { hash: string; parts: Part[] };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const round = (n: number) => String(Math.round(n * DECIMALS) / DECIMALS);
const numbers = (a: ArrayLike<number>) => Array.from(a, round).join(",");

function materialOf(m: THREE.Material | THREE.Material[]): string {
  return [m]
    .flat()
    .map((x: any) =>
      [
        x.type,
        x.color?.getHexString(),
        x.emissive?.getHexString(),
        x.opacity,
        x.transparent,
        x.side,
        x.wireframe,
        x.depthWrite,
        x.depthTest,
        x.toneMapped,
        !!x.map,
        x.map?.image?.width,
        x.map?.image?.height,
        JSON.stringify(
          Object.entries(x.uniforms ?? {}).map(([k, u]: any) => [
            k,
            u?.value?.isColor ? u.value.getHexString() : u?.value,
          ]),
        ),
      ].join(","),
    )
    .join("|");
}

function geometryOf(o: any): string {
  const pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute =
    o.geometry.attributes.position;
  const v = new THREE.Vector3();
  const out: string[] = [];

  if (o instanceof THREE.InstancedMesh) {
    out.push(numbers(o.instanceMatrix.array), String(o.count));
  }

  for (let i = 0; i < pos.count; i++) {
    out.push(
      numbers(
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).toArray(),
      ),
    );
  }

  return `idx:${o.geometry.index?.count ?? 0}|${sha(out.join(";"))}|mat:${materialOf(o.material)}`;
}

function describeNode(o: any): string {
  const base = `${o.type}|v:${o.visible}|`;

  if (o.geometry?.attributes?.position) {
    return base + geometryOf(o);
  }

  if (o.isLight) {
    return `${base}light:${o.color?.getHexString()},${o.intensity},${o.distance ?? ""},${numbers(o.matrixWorld.elements)}`;
  }

  return `${base}m:${numbers(o.matrixWorld.elements)}`;
}

export function fingerprint(root: THREE.Object3D): Print {
  root.updateMatrixWorld(true);

  const parts: Part[] = [];
  const walk = (o: THREE.Object3D, path: string) => {
    const here = `${path}/${o.name || o.type}`;

    parts.push({
      path: here,
      hash: sha(describeNode(o)).slice(0, NODE_HASH_CHARS),
    });
    for (const [i, c] of o.children.entries()) {
      walk(c, `${here}#${i}`);
    }
  };

  walk(root, "");

  return {
    hash: sha(parts.map((p) => p.path + p.hash).join("\n")).slice(
      0,
      MODEL_HASH_CHARS,
    ),
    parts,
  };
}
