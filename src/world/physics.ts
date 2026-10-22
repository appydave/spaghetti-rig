import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { disposeTree } from './toon';

let ready: Promise<void> | undefined;
export const initPhysics = () => (ready ??= RAPIER.init());

interface Piece { object: THREE.Object3D; body: RAPIER.RigidBody; age: number; life: number; lastVy: number; base: THREE.Vector3 }

export interface BreakOptions {
  /** Where the blow came from; pieces fly away from it. */
  from?: THREE.Vector3;
  power?: number;
  life?: number;
  spin?: number;
  up?: number;
}

/**
 * Debris that bounces with real physics. Pieces have no gameplay colliders; they tumble, hit the
 * paving, settle, then sink away. Old pieces are recycled once there are too many.
 */
export class Debris {
  private world: RAPIER.World;
  private pieces: Piece[] = [];
  onBounce?: (strength: number, at: THREE.Vector3) => void;
  private readonly max = 220;

  constructor(private readonly scene: THREE.Scene) {
    this.world = new RAPIER.World({ x: 0, y: -14, z: 0 });
    this.world.timestep = 1 / 60;
    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 2000).setFriction(0.8).setRestitution(0.35), ground);
    // Low kerbs keep most debris on the street.
    for (const side of [-1, 1]) {
      const kerb = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(side * 6.8, 1, 0));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 1, 2000).setRestitution(0.3), kerb);
    }
  }

  get count() { return this.pieces.length; }

  /** Add one ready-made piece (its geometry centred on its origin) at its current world transform. */
  add(object: THREE.Object3D, hull: Float32Array | null, half: THREE.Vector3, velocity: THREE.Vector3, spin: THREE.Vector3, life = 6, offset?: THREE.Vector3) {
    object.updateMatrixWorld(true);
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
    object.matrixWorld.decompose(pos, quat, scale);
    this.scene.attach(object);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
        .setLinvel(velocity.x, velocity.y, velocity.z).setAngvel({ x: spin.x, y: spin.y, z: spin.z }).setLinearDamping(0.15).setAngularDamping(0.25),
    );
    let desc: RAPIER.ColliderDesc | null = hull ? RAPIER.ColliderDesc.convexHull(scaleHull(hull, scale)) : null;
    desc ??= RAPIER.ColliderDesc.cuboid(Math.max(0.02, half.x * scale.x), Math.max(0.02, half.y * scale.y), Math.max(0.02, half.z * scale.z));
    if (offset) desc.setTranslation(offset.x * scale.x, offset.y * scale.y, offset.z * scale.z);
    this.world.createCollider(desc.setRestitution(0.42).setFriction(0.7).setDensity(1), body);
    this.pieces.push({ object, body, age: 0, life: life + Math.random() * 1.5, lastVy: velocity.y, base: scale.clone() });
    while (this.pieces.length > this.max) this.remove(this.pieces[0]!);
  }

  /** Break a model into its parts: every mesh flies off as its own body with a box collider. */
  breakObject(root: THREE.Object3D, opts: BreakOptions = {}) {
    root.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.outline && m.geometry) meshes.push(m); });
    const centre = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
    const from = opts.from ?? centre.clone().add(new THREE.Vector3(0, -0.5, 1));
    for (const m of meshes) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!;
      const half = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const at = m.getWorldPosition(new THREE.Vector3());
      const dir = at.clone().sub(from).normalize();
      const power = (opts.power ?? 5) * (0.6 + Math.random() * 0.8);
      const v = dir.multiplyScalar(power).add(new THREE.Vector3(0, (opts.up ?? 4) * (0.5 + Math.random()), 0));
      const s = opts.spin ?? 8;
      const offset = bb.getCenter(new THREE.Vector3());
      this.add(m, null, half, v, new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s), opts.life ?? 5, offset);
    }
    disposeTree(root);
  }

  step(dt: number) {
    if (dt <= 0) return;
    this.world.timestep = Math.min(1 / 30, dt);
    this.world.step();
    const p = new THREE.Vector3();
    for (const piece of [...this.pieces]) {
      piece.age += dt;
      const t = piece.body.translation(), r = piece.body.rotation(), v = piece.body.linvel();
      piece.object.position.set(t.x, t.y, t.z);
      piece.object.quaternion.set(r.x, r.y, r.z, r.w);
      if (piece.lastVy < -2.5 && v.y > -0.5 && this.onBounce) this.onBounce(Math.min(1, -piece.lastVy / 10), p.set(t.x, t.y, t.z));
      piece.lastVy = v.y;
      const fade = piece.age - piece.life;
      if (fade > 0) piece.object.scale.copy(piece.base).multiplyScalar(Math.max(0.001, 1 - fade * 1.4));
      if (fade > 0.75 || t.y < -5) this.remove(piece);
    }
  }

  private remove(piece: Piece) {
    this.world.removeRigidBody(piece.body);
    this.pieces.splice(this.pieces.indexOf(piece), 1);
    disposeTree(piece.object);
  }

  clear() { for (const p of [...this.pieces]) this.remove(p); }
  dispose() { this.clear(); this.world.free(); }
}

function scaleHull(h: Float32Array, s: THREE.Vector3) {
  const out = new Float32Array(h.length);
  for (let i = 0; i < h.length; i += 3) { out[i] = h[i]! * s.x; out[i + 1] = h[i + 1]! * s.y; out[i + 2] = h[i + 2]! * s.z; }
  return out;
}
