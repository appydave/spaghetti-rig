// The effects' sparks: bursts and heal sparkles as particles, and one instanced mesh that draws them all. Moved out of effects.ts.
import * as THREE from "three";
import { nth } from "#root/src/nth.ts";
import { FX } from "#root/src/world/palette.ts";
import { RANDOM_CENTRE } from "#root/src/world/world-shared.ts";

export interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  age: number;
  size: number;
  color: THREE.Color;
  gravity: number;
  spin: number;
}

/** How a burst looks; every field has a default. */
export interface BurstOptions {
  n?: number;
  colors?: string[];
  speed?: number;
  size?: number;
  life?: number;
  gravity?: number;
  up?: number;
}

const MAX = 900;

const RGB_COMPONENTS = 3;
const DEFAULT_BURST_COUNT = 24;
const DEFAULT_BURST_UP = 0.3;
const DEFAULT_BURST_SPEED = 6;
const BURST_SPEED_MIN = 0.4;
const DEFAULT_BURST_LIFE = 0.6;
const BURST_JITTER_MIN = 0.6;
const BURST_JITTER_RANGE = 0.8;
const DEFAULT_BURST_SIZE = 0.08;
const DEFAULT_BURST_GRAVITY = 9;
const BURST_SPIN_MAX = 10;
const HEAL_SPARKLES = 60;
/** The sparkles spiral up through this many full turns. */
const HEAL_SPIRAL_TURNS = 4;
const HEAL_RADIUS = 0.7;
const HEAL_RISE_PER_SPARKLE = 0.03;
const HEAL_START_DROP = 0.6;
const HEAL_SWIRL_SPEED = 0.8;
const HEAL_LIFT_BASE = 2;
const HEAL_LIFE_BASE = 1.2;
const HEAL_LIFE_JITTER = 0.6;
const HEAL_SPARKLE_SIZE = 0.09;
const HEAL_ACCENT_EVERY = 3;
const HEAL_SINK = -0.5;
const HEAL_SPARKLE_SPIN = 4;
const PARTICLE_DRAG = 1.2;
const FLOOR_Y = 0.03;
const FLOOR_BOUNCE = -0.4;
const SPARK_TUMBLE_RATIO = 0.7;
const SPARK_SHRINK_MIN = 0.3;
const SPARK_SHRINK_RANGE = 0.7;

/** The one instanced mesh every spark is drawn with. */
export function makeSparks(): THREE.InstancedMesh {
  const sparks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: FX.spark, toneMapped: false }),
    MAX,
  );

  sparks.frustumCulled = false;
  sparks.count = 0;
  sparks.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(MAX * RGB_COMPONENTS),
    RGB_COMPONENTS,
  );

  return sparks;
}

/** Add a burst of sparks at a point, dropping the oldest when the pool is full. */
export function addBurst(
  particles: Particle[],
  at: THREE.Vector3,
  opts: BurstOptions,
) {
  const colors = (opts.colors ?? FX.burst).map((c) => new THREE.Color(c));

  for (let i = 0; i < (opts.n ?? DEFAULT_BURST_COUNT); i++) {
    if (particles.length >= MAX) {
      particles.shift();
    }

    const dir = new THREE.Vector3(
      Math.random() - RANDOM_CENTRE,
      Math.random() - RANDOM_CENTRE + (opts.up ?? DEFAULT_BURST_UP),
      Math.random() - RANDOM_CENTRE,
    ).normalize();

    particles.push({
      pos: at.clone(),
      vel: dir.multiplyScalar(
        (opts.speed ?? DEFAULT_BURST_SPEED) * (BURST_SPEED_MIN + Math.random()),
      ),
      life:
        (opts.life ?? DEFAULT_BURST_LIFE) *
        (BURST_JITTER_MIN + Math.random() * BURST_JITTER_RANGE),
      age: 0,
      size:
        (opts.size ?? DEFAULT_BURST_SIZE) *
        (BURST_JITTER_MIN + Math.random() * BURST_JITTER_RANGE),
      color: nth(colors, i % colors.length, "spark colours"),
      gravity: opts.gravity ?? DEFAULT_BURST_GRAVITY,
      spin: Math.random() * BURST_SPIN_MAX,
    });
  }
}

/** Add rising green-and-yellow sparkles spiralling round a body. */
export function addHealSparkles(particles: Particle[], at: THREE.Vector3) {
  for (let i = 0; i < HEAL_SPARKLES; i++) {
    const a = (i / HEAL_SPARKLES) * Math.PI * HEAL_SPIRAL_TURNS * 2;
    const r = HEAL_RADIUS;

    if (particles.length >= MAX) {
      particles.shift();
    }

    particles.push({
      pos: at
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(a) * r,
            i * HEAL_RISE_PER_SPARKLE - HEAL_START_DROP,
            Math.sin(a) * r,
          ),
        ),
      vel: new THREE.Vector3(
        -Math.sin(a) * HEAL_SWIRL_SPEED,
        HEAL_LIFT_BASE + Math.random(),
        Math.cos(a) * HEAL_SWIRL_SPEED,
      ),
      life: HEAL_LIFE_BASE + Math.random() * HEAL_LIFE_JITTER,
      age: 0,
      size: HEAL_SPARKLE_SIZE,
      color: new THREE.Color(
        i % HEAL_ACCENT_EVERY ? FX.healSparkle : FX.healSparkleAccent,
      ),
      gravity: HEAL_SINK,
      spin: HEAL_SPARKLE_SPIN,
    });
  }
}

/** Move one live particle on by dt: gravity, drag, and a bounce off the floor. */
function moveParticle(p: Particle, dt: number) {
  p.vel.y -= p.gravity * dt;
  p.vel.multiplyScalar(1 - dt * PARTICLE_DRAG);
  p.pos.addScaledVector(p.vel, dt);
  if (p.pos.y < FLOOR_Y) {
    p.pos.y = FLOOR_Y;
    p.vel.y *= FLOOR_BOUNCE;
  }
}

/** Age the particles by dt, move the live ones and draw them into the sparks mesh. Returns the particles still alive. */
export function stepParticles(
  all: Particle[],
  sparks: THREE.InstancedMesh,
  dummy: THREE.Object3D,
  dt: number,
): Particle[] {
  let n = 0;

  const particles = all.filter((p) => (p.age += dt) < p.life);

  for (const p of particles) {
    moveParticle(p, dt);

    const k = 1 - p.age / p.life;

    dummy.position.copy(p.pos);
    dummy.rotation.set(p.age * p.spin, p.age * p.spin * SPARK_TUMBLE_RATIO, 0);
    dummy.scale.setScalar(p.size * (SPARK_SHRINK_MIN + k * SPARK_SHRINK_RANGE));
    dummy.updateMatrix();
    sparks.setMatrixAt(n, dummy.matrix);
    sparks.setColorAt(n, p.color);
    n++;
  }

  sparks.count = n;
  sparks.instanceMatrix.needsUpdate = true;
  if (sparks.instanceColor) {
    sparks.instanceColor.needsUpdate = true;
  }

  return particles;
}
