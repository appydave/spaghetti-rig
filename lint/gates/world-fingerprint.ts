// How a PlayerWorld is looked at (G04 H1): its scene graph (every node's transform, visibility and material), the state it holds besides
// the scene, and a hash of both. Used by world-proof.test.ts.
// Instanced meshes (the effects' sparks) are fingerprinted too: how many instances are live, where, and in what colour.
import { createHash } from "node:crypto";
import type * as THREE from "three";

/** Coordinates are rounded to this scale (four decimals) so float noise in the last bits cannot show. */
const DECIMALS = 1e4;
/** How many hex characters of each hash are kept. */
const HASH_CHARS = 12;

export const sha = (s: string) =>
  createHash("sha1").update(s).digest("hex").slice(0, HASH_CHARS);
export const num = (n: number) => String(Math.round(n * DECIMALS) / DECIMALS);

const nums = (a: ArrayLike<number>) => Array.from(a, (n) => num(n)).join(",");

/** Components per vertex position. */
const XYZ = 3;
const MATRIX_SIZE = 16;

type Positions = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

const hashed = new WeakMap<Positions, { stamp: string; hash: string }>();

/** A cache stamp: three.js raises an attribute's version whenever it is flagged for upload (needsUpdate), so a hash is reused only while neither changed. */
const stampOf = (a: Positions) =>
  `${a.count}|${"version" in a ? a.version : ""}`;

/** A short hash of a geometry's vertex positions, rounded: what hand-built geometry (tubes, extrusions) is made of, which a count alone hides. */
function positionsOf(a: Positions | undefined): string {
  if (!a) {
    return "";
  }

  const stamp = stampOf(a);
  const known = hashed.get(a);

  if (known?.stamp === stamp) {
    return known.hash;
  }

  const rounded = new Int32Array(a.count * XYZ);

  for (let i = 0; i < a.count; i++) {
    rounded[i * XYZ] = Math.round(a.getX(i) * DECIMALS);
    rounded[i * XYZ + 1] = Math.round(a.getY(i) * DECIMALS);
    rounded[i * XYZ + 2] = Math.round(a.getZ(i) * DECIMALS);
  }

  const hash = `${a.count}:${createHash("sha1").update(rounded).digest("hex").slice(0, HASH_CHARS)}`;

  hashed.set(a, { stamp, hash });

  return hash;
}

/** Every decimal number in a line of text, rounded like the rest of the fingerprint (a drawing call's angle or offset comes from trig). */
const roundedIn = (text: string) =>
  text.replaceAll(/-?\d+\.\d+(?:e[-+]?\d+)?/g, (n) => num(Number(n)));

/** What was drawn on a texture's canvas: its size and a hash of every drawing call and property set the builders made, numbers rounded. */
function paintedOn(
  image: { width: number; height: number; log?: string[] } | undefined,
) {
  return image?.log
    ? `${image.width}x${image.height}:${createHash("sha1")
        .update(roundedIn(image.log.join("\n")))
        .digest("hex")
        .slice(0, HASH_CHARS)}`
    : "";
}

/** An instanced mesh (the sparks): how many instances are live, and where and in what colour each one is. */
function instancesOf(o: any): string {
  if (!o.isInstancedMesh) {
    return "";
  }

  const m: number[] = Array.from(
    o.instanceMatrix.array.slice(0, o.count * MATRIX_SIZE),
  );
  const c: number[] = o.instanceColor
    ? Array.from(o.instanceColor.array.slice(0, o.count * XYZ))
    : [];

  return `${o.count}:${nums(m)}:${nums(c)}`;
}

/** Every node of the scene: its place in the graph, transform, visibility, material and light. */
export function sceneOf(root: THREE.Object3D): string {
  root.updateMatrixWorld(true);

  const lines: string[] = [];

  root.traverse((o: any) => {
    const m = [o.material].flat().find(Boolean);

    lines.push(
      [
        o.type,
        o.name,
        o.visible,
        o.castShadow,
        o.receiveShadow,
        nums(o.matrixWorld.elements),
        positionsOf(o.geometry?.attributes?.position),
        m ? [m.color?.getHexString(), num(m.opacity), m.visible].join("/") : "",
        paintedOn(m?.map?.image),
        instancesOf(o),
        o.isLight ? [o.color.getHexString(), num(o.intensity)].join("/") : "",
      ].join("|"),
    );
  });

  return lines.join("\n");
}

/** What the world holds besides its scene: the numbers and flags a split of world.ts could drop or reorder. */
export function stateOf(w: any): string {
  // The clock, the tweens and the cues have no public reading: they live on the world's timeline when it has one, else on the world.
  const t = w.timeline ?? w;
  // The street's objects (the gates, the stop window, the debt, the boss, the pile) live on the world's street when it has one, else on the world.
  const st = w.street ?? w;
  // The score, the shots, the bugs shipped, the enemies and the aim live on the world's combat when it has one, else on the world.
  const c = w.combat ?? w;
  const v = (p: THREE.Vector3 | null | undefined) =>
    p ? nums(p.toArray()) : "-";

  return JSON.stringify([
    // Only what the Director and the e2e tests can read: the world's public surface (the enemies and the aim are seen through the enemy
    // count, enemyScreen and autoAimScreen below, and as nodes of the scene).
    c.score,
    c.shots,
    c.shipped,
    w.combat ? w.combat.enemies.length : w.enemyCount,
    st.windowKey,
    num(w.health),
    st.bossTotal,
    st.bossLeft,
    w.aspect,
    w.shape,
    w.camMode,
    num(t.clock),
    num(w.shake),
    nums(w.camera.position.toArray()),
    nums(w.camera.quaternion.toArray()),
    v(w.rig?.pos ?? w.camPos),
    v(w.rig?.look ?? w.camLook),
    w.state,
    w.walk ? [w.walk.from, w.walk.to, num(w.walk.u), w.walk.next] : null,
    st.gates.map((g: any) => g.state),
    t.tweens.length,
    t.cues.length,
    st.window ? [st.window.key, st.window.reading] : null,
    st.debt.map((d: any) => d.key),
    st.boss ? "boss" : null,
    st.pile ? "pile" : null,
    w.character.pose,
    nums(w.character.root.position.toArray()),
    w.fx.pool?.length ?? "",
    // What the Director asks the world each frame to draw its aim and its target: where the autogunner aims and the first enemy sits on screen.
    c
      .autoAimScreen()
      ?.toArray()
      .map((n: number) => num(n)) ?? "-",
    c
      .enemyScreen()
      ?.toArray()
      .map((n: number) => num(n)) ?? "-",
  ]);
}
