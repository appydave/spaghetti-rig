import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { disposeTree } from "#root/src/world/toon.ts";
import { nth, present } from "#root/src/nth.ts";
import { randomSpread } from "#root/src/world/world-shared.ts";

const MAX_PIECES = 220;
const GRAVITY_Y = -14;
const FIXED_STEPS_PER_SECOND = 60;
const SLOWEST_STEPS_PER_SECOND = 30;
const FIXED_TIMESTEP = 1 / FIXED_STEPS_PER_SECOND;
const MAX_TIMESTEP = 1 / SLOWEST_STEPS_PER_SECOND;
const GROUND_TOP_OFFSET_Y = -0.5;
const GROUND_HALF_WIDTH = 500;
const GROUND_HALF_HEIGHT = 0.5;
const STREET_HALF_LENGTH = 2000;
const GROUND_FRICTION = 0.8;
const GROUND_RESTITUTION = 0.35;
const KERB_OFFSET_X = 6.8;
const KERB_HALF_WIDTH = 0.3;
const KERB_RESTITUTION = 0.3;
const PIECE_LINEAR_DAMPING = 0.15;
const PIECE_ANGULAR_DAMPING = 0.25;
const PIECE_RESTITUTION = 0.42;
const PIECE_FRICTION = 0.7;
const MIN_COLLIDER_HALF_EXTENT = 0.02;
const DEFAULT_PIECE_LIFE = 6;
const PIECE_LIFE_JITTER = 1.5;
const BREAK_FROM_BELOW_Y = -0.5;
const BREAK_FROM_FRONT_Z = 1;
const SIZE_TO_HALF_EXTENT = 0.5;
const DEFAULT_BREAK_POWER = 5;
const BREAK_POWER_MIN = 0.6;
const BREAK_POWER_RANGE = 0.8;
const DEFAULT_BREAK_UP = 4;
const BREAK_UP_MIN = 0.5;
const DEFAULT_BREAK_SPIN = 8;
const DEFAULT_BREAK_LIFE = 5;
const BOUNCE_MIN_FALL_SPEED = -2.5;
const BOUNCE_MAX_REBOUND_SPEED = -0.5;
const BOUNCE_STRENGTH_SPEED = 10;
const MIN_FADE_SCALE = 0.001;
const FADE_SHRINK_RATE = 1.4;
const FADE_REMOVE_AFTER = 0.75;
const FELL_OUT_OF_WORLD_Y = -5;
const AXIS_COUNT = 3;

let ready: Promise<void> | undefined;

export const initPhysics = () => (ready ??= RAPIER.init());

interface Piece {
  object: THREE.Object3D;
  body: RAPIER.RigidBody;
  age: number;
  life: number;
  lastVy: number;
  base: THREE.Vector3;
}

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
  private readonly world: RAPIER.World;
  private readonly pieces: Piece[] = [];
  onBounce?: (strength: number, at: THREE.Vector3) => void;
  private readonly max = MAX_PIECES;

  constructor(private readonly scene: THREE.Scene) {
    this.world = new RAPIER.World({ x: 0, y: GRAVITY_Y, z: 0 });
    this.world.timestep = FIXED_TIMESTEP;

    const ground = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, GROUND_TOP_OFFSET_Y, 0),
    );

    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        GROUND_HALF_WIDTH,
        GROUND_HALF_HEIGHT,
        STREET_HALF_LENGTH,
      )
        .setFriction(GROUND_FRICTION)
        .setRestitution(GROUND_RESTITUTION),
      ground,
    );
    // Low kerbs keep most debris on the street.
    for (const side of [-1, 1]) {
      const kerb = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(side * KERB_OFFSET_X, 1, 0),
      );

      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          KERB_HALF_WIDTH,
          1,
          STREET_HALF_LENGTH,
        ).setRestitution(KERB_RESTITUTION),
        kerb,
      );
    }
  }

  get count() {
    return this.pieces.length;
  }

  /** Add one ready-made piece (its geometry centred on its origin) at its current world transform. */
  add(
    object: THREE.Object3D,
    hull: Float32Array | null,
    half: THREE.Vector3,
    velocity: THREE.Vector3,
    spin: THREE.Vector3,
    life = DEFAULT_PIECE_LIFE,
    offset?: THREE.Vector3,
  ) {
    object.updateMatrixWorld(true);

    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    object.matrixWorld.decompose(pos, quat, scale);
    this.scene.attach(object);

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
        .setLinvel(velocity.x, velocity.y, velocity.z)
        .setAngvel({ x: spin.x, y: spin.y, z: spin.z })
        .setLinearDamping(PIECE_LINEAR_DAMPING)
        .setAngularDamping(PIECE_ANGULAR_DAMPING),
    );
    let desc: RAPIER.ColliderDesc | null = hull
      ? RAPIER.ColliderDesc.convexHull(scaleHull(hull, scale))
      : null;

    desc ??= RAPIER.ColliderDesc.cuboid(
      Math.max(MIN_COLLIDER_HALF_EXTENT, half.x * scale.x),
      Math.max(MIN_COLLIDER_HALF_EXTENT, half.y * scale.y),
      Math.max(MIN_COLLIDER_HALF_EXTENT, half.z * scale.z),
    );
    if (offset) {
      desc.setTranslation(
        offset.x * scale.x,
        offset.y * scale.y,
        offset.z * scale.z,
      );
    }

    this.world.createCollider(
      desc
        .setRestitution(PIECE_RESTITUTION)
        .setFriction(PIECE_FRICTION)
        .setDensity(1),
      body,
    );
    this.pieces.push({
      object,
      body,
      age: 0,
      life: life + Math.random() * PIECE_LIFE_JITTER,
      lastVy: velocity.y,
      base: scale.clone(),
    });
    while (this.pieces.length > this.max) {
      this.remove(nth(this.pieces, 0, "pieces"));
    }
  }

  /** Break a model into its parts: every mesh flies off as its own body with a box collider. */
  breakObject(root: THREE.Object3D, opts: BreakOptions = {}) {
    root.updateMatrixWorld(true);

    const meshes: THREE.Mesh[] = [];

    root.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData.outline) {
        meshes.push(o);
      }
    });

    const centre = new THREE.Box3()
      .setFromObject(root)
      .getCenter(new THREE.Vector3());
    const from =
      opts.from ??
      centre
        .clone()
        .add(new THREE.Vector3(0, BREAK_FROM_BELOW_Y, BREAK_FROM_FRONT_Z));

    for (const m of meshes) {
      if (!m.geometry.boundingBox) {
        m.geometry.computeBoundingBox();
      }

      const bb = present(m.geometry.boundingBox, "the mesh bounding box");
      const half = bb
        .getSize(new THREE.Vector3())
        .multiplyScalar(SIZE_TO_HALF_EXTENT);
      const at = m.getWorldPosition(new THREE.Vector3());
      const dir = at.clone().sub(from).normalize();
      const power =
        (opts.power ?? DEFAULT_BREAK_POWER) *
        (BREAK_POWER_MIN + Math.random() * BREAK_POWER_RANGE);
      const v = dir
        .multiplyScalar(power)
        .add(
          new THREE.Vector3(
            0,
            (opts.up ?? DEFAULT_BREAK_UP) * (BREAK_UP_MIN + Math.random()),
            0,
          ),
        );
      const s = opts.spin ?? DEFAULT_BREAK_SPIN;
      const offset = bb.getCenter(new THREE.Vector3());

      this.add(
        m,
        null,
        half,
        v,
        randomSpread(s),
        opts.life ?? DEFAULT_BREAK_LIFE,
        offset,
      );
    }

    disposeTree(root);
  }

  step(dt: number) {
    if (dt <= 0) {
      return;
    }

    this.world.timestep = Math.min(MAX_TIMESTEP, dt);
    this.world.step();

    const p = new THREE.Vector3();
    // Iterate a snapshot: remove() splices a piece out of the live list inside the loop.
    const snapshot = this.pieces.slice();

    for (const piece of snapshot) {
      piece.age += dt;

      const t = piece.body.translation();
      const r = piece.body.rotation();
      const v = piece.body.linvel();

      piece.object.position.set(t.x, t.y, t.z);
      piece.object.quaternion.set(r.x, r.y, r.z, r.w);
      if (
        piece.lastVy < BOUNCE_MIN_FALL_SPEED &&
        v.y > BOUNCE_MAX_REBOUND_SPEED &&
        this.onBounce
      ) {
        this.onBounce(
          Math.min(1, -piece.lastVy / BOUNCE_STRENGTH_SPEED),
          p.set(t.x, t.y, t.z),
        );
      }

      piece.lastVy = v.y;

      const fade = piece.age - piece.life;

      if (fade > 0) {
        piece.object.scale
          .copy(piece.base)
          .multiplyScalar(
            Math.max(MIN_FADE_SCALE, 1 - fade * FADE_SHRINK_RATE),
          );
      }

      if (fade > FADE_REMOVE_AFTER || t.y < FELL_OUT_OF_WORLD_Y) {
        this.remove(piece);
      }
    }
  }

  private remove(piece: Piece) {
    this.world.removeRigidBody(piece.body);
    this.pieces.splice(this.pieces.indexOf(piece), 1);
    disposeTree(piece.object);
  }

  clear() {
    const snapshot = this.pieces.slice();

    for (const p of snapshot) {
      this.remove(p);
    }
  }

  dispose() {
    this.clear();
    this.world.free();
  }
}

function scaleHull(h: Float32Array, s: THREE.Vector3) {
  const axes = [s.x, s.y, s.z];

  return Float32Array.from(
    h,
    (v, i) => v * nth(axes, i % AXIS_COUNT, "hull axes"),
  );
}
