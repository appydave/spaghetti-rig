import * as THREE from "three";
import { isDrawable, mapOf } from "./objects";
import { context2d } from "../dom";
import { nth } from "../nth";
import { FX } from "./palette";
import { RANDOM_CENTRE } from "./world-shared";

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  age: number;
  size: number;
  color: THREE.Color;
  gravity: number;
  spin: number;
}
interface Fader {
  obj: THREE.Object3D;
  mat: THREE.Material & { opacity: number };
  age: number;
  life: number;
  tick: (k: number, o: THREE.Object3D) => void;
}

const MAX = 900;

const FLASH_DISTANCE = 9;
const FLASH_LIGHT_DECAY = 2;
const RGB_COMPONENTS = 3;
const TRACER_MIDPOINT = 0.5;
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
const CONFETTI_COUNT = 120;
const CONFETTI_SPEED = 9;
const CONFETTI_SIZE = 0.12;
const CONFETTI_LIFE = 2.6;
const CONFETTI_GRAVITY = 5;
const CONFETTI_UP = 1.4;
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
const HEAL_RING_SIZE = 1.6;
const HEAL_RING_LIFE = 0.9;
const RING_DEFAULT_SIZE = 1.2;
const RING_DEFAULT_LIFE = 0.45;
const RING_OPACITY = 0.9;
const RING_TUBE_RADIUS = 0.06;
const RING_TUBE_SEGMENTS = 6;
const RING_SEGMENTS = 40;
const RING_START_SCALE = 0.2;
const TRACER_DEFAULT_WIDTH = 0.06;
const TRACER_TIP_TAPER = 0.4;
const TRACER_SEGMENTS = 6;
const TRACER_LIFE = 0.14;
const BEAM_WIDTH = 0.22;
const BEAM_CORE_WIDTH = 0.08;
const MUZZLE_LIGHT_INTENSITY = 6;
const MUZZLE_LIGHT_TIME = 0.08;
const MUZZLE_SPRITE_SCALE = 0.7;
const MUZZLE_SPRITE_GROWTH = 0.6;
const MUZZLE_SPRITE_LIFE = 0.09;
const TEXT_DEFAULT_SIZE = 0.9;
const TEXT_DEFAULT_LIFE = 1.1;
const TEXT_CANVAS_WIDTH = 512;
const TEXT_CANVAS_HEIGHT = 160;
const TEXT_CENTRE_X = 256;
const TEXT_CENTRE_Y = 84;
const TEXT_OUTLINE_WIDTH = 16;
const TEXT_RENDER_ORDER = 50;
const TEXT_ASPECT = 3.2;
const TEXT_RISE = 0.9;
const TEXT_FADE_START = 0.7;
const TEXT_FADE_SPAN = 0.3;
const TEXT_POP_SPEED = 6;
const TEXT_POP_MIN = 0.6;
const TEXT_POP_RANGE = 0.4;
const FLASH_FADE_RATE = 80;
const PARTICLE_DRAG = 1.2;
const FLOOR_Y = 0.03;
const FLOOR_BOUNCE = -0.4;
const SPARK_TUMBLE_RATIO = 0.7;
const SPARK_SHRINK_MIN = 0.3;
const SPARK_SHRINK_RANGE = 0.7;
const GLOW_SIZE = 128;
const GLOW_CENTRE = 64;
const GLOW_MID_STOP = 0.3;
const GLOW_STAR_INSET = 58;
const GLOW_STAR_OUTSET = 70;

/** Sparks, rings, tracers, flashes, confetti and floating text. Cheap and pooled. */
export class Effects {
  private readonly sparks: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private faders: Fader[] = [];
  private readonly dummy = new THREE.Object3D();
  readonly flash = new THREE.PointLight(
    FX.muzzleLight,
    0,
    FLASH_DISTANCE,
    FLASH_LIGHT_DECAY,
  );
  private flashT = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.sparks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: FX.spark, toneMapped: false }),
      MAX,
    );
    this.sparks.frustumCulled = false;
    this.sparks.count = 0;
    this.sparks.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX * RGB_COMPONENTS),
      RGB_COMPONENTS,
    );
    scene.add(this.sparks, this.flash);
  }

  burst(
    at: THREE.Vector3,
    opts: {
      n?: number;
      colors?: string[];
      speed?: number;
      size?: number;
      life?: number;
      gravity?: number;
      up?: number;
    } = {},
  ) {
    const colors = (opts.colors ?? FX.burst).map((c) => new THREE.Color(c));

    for (let i = 0; i < (opts.n ?? DEFAULT_BURST_COUNT); i++) {
      if (this.particles.length >= MAX) {
        this.particles.shift();
      }

      const dir = new THREE.Vector3(
        Math.random() - RANDOM_CENTRE,
        Math.random() - RANDOM_CENTRE + (opts.up ?? DEFAULT_BURST_UP),
        Math.random() - RANDOM_CENTRE,
      ).normalize();

      this.particles.push({
        pos: at.clone(),
        vel: dir.multiplyScalar(
          (opts.speed ?? DEFAULT_BURST_SPEED) *
            (BURST_SPEED_MIN + Math.random()),
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

  confetti(at: THREE.Vector3, n = CONFETTI_COUNT) {
    this.burst(at, {
      n,
      colors: FX.confetti,
      speed: CONFETTI_SPEED,
      size: CONFETTI_SIZE,
      life: CONFETTI_LIFE,
      gravity: CONFETTI_GRAVITY,
      up: CONFETTI_UP,
    });
  }

  /** Rising green-and-yellow sparkles around a body. */
  heal(at: THREE.Vector3) {
    for (let i = 0; i < HEAL_SPARKLES; i++) {
      const a = (i / HEAL_SPARKLES) * Math.PI * HEAL_SPIRAL_TURNS * 2;
      const r = HEAL_RADIUS;

      if (this.particles.length >= MAX) {
        this.particles.shift();
      }

      this.particles.push({
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

    this.ring(at, FX.healRing, HEAL_RING_SIZE, HEAL_RING_LIFE, true);
  }

  ring(
    at: THREE.Vector3,
    color = FX.ring,
    size = RING_DEFAULT_SIZE,
    life = RING_DEFAULT_LIFE,
    flat = false,
    face?: THREE.Vector3,
  ) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: RING_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(
        1,
        RING_TUBE_RADIUS,
        RING_TUBE_SEGMENTS,
        RING_SEGMENTS,
      ),
      mat,
    );

    ring.position.copy(at);
    if (flat) {
      ring.rotation.x = Math.PI / 2;
    } else if (face) {
      ring.lookAt(face);
    }

    this.scene.add(ring);
    this.faders.push({
      obj: ring,
      mat,
      age: 0,
      life,
      tick: (k, o) => {
        o.scale.setScalar(RING_START_SCALE + k * size);
        mat.opacity = RING_OPACITY * (1 - k);
      },
    });
  }

  tracer(
    from: THREE.Vector3,
    to: THREE.Vector3,
    color = FX.tracer,
    width = TRACER_DEFAULT_WIDTH,
  ) {
    const len = from.distanceTo(to);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      toneMapped: false,
    });
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(
        width,
        width * TRACER_TIP_TAPER,
        len,
        TRACER_SEGMENTS,
        1,
        true,
      ),
      mat,
    );

    beam.position.copy(from).lerp(to, TRACER_MIDPOINT);
    beam.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      to.clone().sub(from).normalize(),
    );
    this.scene.add(beam);
    this.faders.push({
      obj: beam,
      mat,
      age: 0,
      life: TRACER_LIFE,
      tick: (k) => {
        mat.opacity = 1 - k;
      },
    });
  }

  /** A thick glowing beam (tool card power shot). */
  beam(from: THREE.Vector3, to: THREE.Vector3, color = FX.beam) {
    this.tracer(from, to, color, BEAM_WIDTH);
    this.tracer(from, to, FX.beamCore, BEAM_CORE_WIDTH);
  }

  muzzle(at: THREE.Vector3, color = FX.muzzle) {
    this.flash.position.copy(at);
    this.flash.color.set(color);
    this.flash.intensity = MUZZLE_LIGHT_INTENSITY;
    this.flashT = MUZZLE_LIGHT_TIME;

    const mat = new THREE.SpriteMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      toneMapped: false,
      map: glow(),
    });
    const s = new THREE.Sprite(mat);

    s.position.copy(at);
    s.scale.setScalar(MUZZLE_SPRITE_SCALE);
    this.scene.add(s);
    this.faders.push({
      obj: s,
      mat,
      age: 0,
      life: MUZZLE_SPRITE_LIFE,
      tick: (k, o) => {
        o.scale.setScalar(MUZZLE_SPRITE_SCALE + k * MUZZLE_SPRITE_GROWTH);
        mat.opacity = 1 - k;
      },
    });
  }

  /** Floating text in the world ("+100", "−30%"). */
  text(
    at: THREE.Vector3,
    s: string,
    color = FX.text,
    size = TEXT_DEFAULT_SIZE,
    life = TEXT_DEFAULT_LIFE,
  ) {
    const cv = document.createElement("canvas");

    cv.width = TEXT_CANVAS_WIDTH;
    cv.height = TEXT_CANVAS_HEIGHT;

    const g = context2d(cv);

    g.font = "italic 800 120px Barlow, Impact, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = TEXT_OUTLINE_WIDTH;
    g.strokeStyle = FX.textOutline;
    g.lineJoin = "round";
    g.strokeText(s, TEXT_CENTRE_X, TEXT_CENTRE_Y);
    g.fillStyle = color;
    g.fillText(s, TEXT_CENTRE_X, TEXT_CENTRE_Y);

    const tex = new THREE.CanvasTexture(cv);

    tex.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      toneMapped: false,
    });
    const sp = new THREE.Sprite(mat);

    sp.renderOrder = TEXT_RENDER_ORDER;
    sp.position.copy(at);
    sp.scale.set(size * TEXT_ASPECT, size, 1);
    this.scene.add(sp);

    const y0 = at.y;

    this.faders.push({
      obj: sp,
      mat,
      age: 0,
      life,
      tick: (k, o) => {
        o.position.y = y0 + k * TEXT_RISE;
        mat.opacity =
          k < TEXT_FADE_START ? 1 : 1 - (k - TEXT_FADE_START) / TEXT_FADE_SPAN;

        const p = Math.min(1, k * TEXT_POP_SPEED);

        o.scale.set(
          size * TEXT_ASPECT * (TEXT_POP_MIN + p * TEXT_POP_RANGE),
          size * (TEXT_POP_MIN + p * TEXT_POP_RANGE),
          1,
        );
      },
    });
  }

  update(dt: number) {
    this.flashT -= dt;
    if (this.flashT <= 0) {
      this.flash.intensity = Math.max(
        0,
        this.flash.intensity - dt * FLASH_FADE_RATE,
      );
    }

    let n = 0;

    this.particles = this.particles.filter((p) => (p.age += dt) < p.life);
    for (const p of this.particles) {
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(1 - dt * PARTICLE_DRAG);
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < FLOOR_Y) {
        p.pos.y = FLOOR_Y;
        p.vel.y *= FLOOR_BOUNCE;
      }

      const k = 1 - p.age / p.life;

      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(
        p.age * p.spin,
        p.age * p.spin * SPARK_TUMBLE_RATIO,
        0,
      );
      this.dummy.scale.setScalar(
        p.size * (SPARK_SHRINK_MIN + k * SPARK_SHRINK_RANGE),
      );
      this.dummy.updateMatrix();
      this.sparks.setMatrixAt(n, this.dummy.matrix);
      this.sparks.setColorAt(n, p.color);
      n++;
    }

    this.sparks.count = n;
    this.sparks.instanceMatrix.needsUpdate = true;
    if (this.sparks.instanceColor) {
      this.sparks.instanceColor.needsUpdate = true;
    }

    // Iterate a snapshot: finished faders are spliced out of the live list inside the loop.
    const snapshot = this.faders.slice();

    for (const f of snapshot) {
      f.age += dt;

      const k = Math.min(1, f.age / f.life);

      f.tick(k, f.obj);
      if (k >= 1) {
        this.faders.splice(this.faders.indexOf(f), 1);
        f.obj.removeFromParent();
        if (isDrawable(f.obj)) {
          f.obj.geometry.dispose();
        }

        const map = mapOf(f.mat);

        if (map && !map.userData.shared) {
          map.dispose();
        }

        f.mat.dispose();
      }
    }
  }

  clear() {
    this.particles = [];
    for (const f of this.faders) {
      f.obj.removeFromParent();
      f.mat.dispose();
    }

    this.faders = [];
  }
}

let glowTex: THREE.CanvasTexture | undefined;

function glow() {
  if (glowTex) {
    return glowTex;
  }

  const cv = document.createElement("canvas");

  cv.width = cv.height = GLOW_SIZE;

  const g = context2d(cv);
  const grad = g.createRadialGradient(
    GLOW_CENTRE,
    GLOW_CENTRE,
    0,
    GLOW_CENTRE,
    GLOW_CENTRE,
    GLOW_CENTRE,
  );

  grad.addColorStop(0, FX.glowCore);
  grad.addColorStop(GLOW_MID_STOP, FX.glowMid);
  grad.addColorStop(1, FX.glowEdge);
  g.fillStyle = grad;
  g.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  // Four-point star flare.
  g.fillStyle = FX.glowStar;
  g.beginPath();
  g.moveTo(GLOW_CENTRE, 0);
  g.lineTo(GLOW_STAR_OUTSET, GLOW_STAR_INSET);
  g.lineTo(GLOW_SIZE, GLOW_CENTRE);
  g.lineTo(GLOW_STAR_OUTSET, GLOW_STAR_OUTSET);
  g.lineTo(GLOW_CENTRE, GLOW_SIZE);
  g.lineTo(GLOW_STAR_INSET, GLOW_STAR_OUTSET);
  g.lineTo(0, GLOW_CENTRE);
  g.lineTo(GLOW_STAR_INSET, GLOW_STAR_INSET);
  g.closePath();
  g.fill();
  glowTex = new THREE.CanvasTexture(cv);
  glowTex.userData.shared = true;

  return glowTex;
}
