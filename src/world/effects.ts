import * as THREE from "three";
import { isDrawable, mapOf } from "./objects";
import { context2d } from "../dom";
import { nth } from "../nth";

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

/** Sparks, rings, tracers, flashes, confetti and floating text. Cheap and pooled. */
export class Effects {
  private readonly sparks: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private faders: Fader[] = [];
  private readonly dummy = new THREE.Object3D();
  readonly flash = new THREE.PointLight("#ffdc85", 0, 9, 2);
  private flashT = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.sparks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }),
      MAX,
    );
    this.sparks.frustumCulled = false;
    this.sparks.count = 0;
    this.sparks.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX * 3),
      3,
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
    const colors = (opts.colors ?? ["#fff3b0", "#f9db48", "#ffae59"]).map(
      (c) => new THREE.Color(c),
    );

    for (let i = 0; i < (opts.n ?? 24); i++) {
      if (this.particles.length >= MAX) {
        this.particles.shift();
      }

      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5 + (opts.up ?? 0.3),
        Math.random() - 0.5,
      ).normalize();

      this.particles.push({
        pos: at.clone(),
        vel: dir.multiplyScalar((opts.speed ?? 6) * (0.4 + Math.random())),
        life: (opts.life ?? 0.6) * (0.6 + Math.random() * 0.8),
        age: 0,
        size: (opts.size ?? 0.08) * (0.6 + Math.random() * 0.8),
        color: nth(colors, i % colors.length, "spark colours"),
        gravity: opts.gravity ?? 9,
        spin: Math.random() * 10,
      });
    }
  }

  confetti(at: THREE.Vector3, n = 120) {
    this.burst(at, {
      n,
      colors: [
        "#f9db48",
        "#aee5a3",
        "#ff8b69",
        "#bd9bff",
        "#8ebebf",
        "#f4f4e8",
      ],
      speed: 9,
      size: 0.12,
      life: 2.6,
      gravity: 5,
      up: 1.4,
    });
  }

  /** Rising green-and-yellow sparkles around a body. */
  heal(at: THREE.Vector3) {
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 8;
      const r = 0.7;

      if (this.particles.length >= MAX) {
        this.particles.shift();
      }

      this.particles.push({
        pos: at
          .clone()
          .add(
            new THREE.Vector3(Math.cos(a) * r, i * 0.03 - 0.6, Math.sin(a) * r),
          ),
        vel: new THREE.Vector3(
          -Math.sin(a) * 0.8,
          2 + Math.random(),
          Math.cos(a) * 0.8,
        ),
        life: 1.2 + Math.random() * 0.6,
        age: 0,
        size: 0.09,
        color: new THREE.Color(i % 3 ? "#aee5a3" : "#f9db48"),
        gravity: -0.5,
        spin: 4,
      });
    }

    this.ring(at, "#aee5a3", 1.6, 0.9, true);
  }

  ring(
    at: THREE.Vector3,
    color = "#f9db48",
    size = 1.2,
    life = 0.45,
    flat = false,
    face?: THREE.Vector3,
  ) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), mat);

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
        o.scale.setScalar(0.2 + k * size);
        mat.opacity = 0.9 * (1 - k);
      },
    });
  }

  tracer(
    from: THREE.Vector3,
    to: THREE.Vector3,
    color = "#fff1a8",
    width = 0.06,
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
      new THREE.CylinderGeometry(width, width * 0.4, len, 6, 1, true),
      mat,
    );

    beam.position.copy(from).lerp(to, 0.5);
    beam.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      to.clone().sub(from).normalize(),
    );
    this.scene.add(beam);
    this.faders.push({
      obj: beam,
      mat,
      age: 0,
      life: 0.14,
      tick: (k) => {
        mat.opacity = 1 - k;
      },
    });
  }

  /** A thick glowing beam (tool card power shot). */
  beam(from: THREE.Vector3, to: THREE.Vector3, color = "#aee5a3") {
    this.tracer(from, to, color, 0.22);
    this.tracer(from, to, "#ffffff", 0.08);
  }

  muzzle(at: THREE.Vector3, color = "#ffdc85") {
    this.flash.position.copy(at);
    this.flash.color.set(color);
    this.flash.intensity = 6;
    this.flashT = 0.08;

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
    s.scale.setScalar(0.7);
    this.scene.add(s);
    this.faders.push({
      obj: s,
      mat,
      age: 0,
      life: 0.09,
      tick: (k, o) => {
        o.scale.setScalar(0.7 + k * 0.6);
        mat.opacity = 1 - k;
      },
    });
  }

  /** Floating text in the world ("+100", "−30%"). */
  text(
    at: THREE.Vector3,
    s: string,
    color = "#f9db48",
    size = 0.9,
    life = 1.1,
  ) {
    const cv = document.createElement("canvas");

    cv.width = 512;
    cv.height = 160;

    const g = context2d(cv);

    g.font = "italic 800 120px Barlow, Impact, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 16;
    g.strokeStyle = "#173e35";
    g.lineJoin = "round";
    g.strokeText(s, 256, 84);
    g.fillStyle = color;
    g.fillText(s, 256, 84);

    const tex = new THREE.CanvasTexture(cv);

    tex.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      toneMapped: false,
    });
    const sp = new THREE.Sprite(mat);

    sp.renderOrder = 50;
    sp.position.copy(at);
    sp.scale.set(size * 3.2, size, 1);
    this.scene.add(sp);

    const y0 = at.y;

    this.faders.push({
      obj: sp,
      mat,
      age: 0,
      life,
      tick: (k, o) => {
        o.position.y = y0 + k * 0.9;
        mat.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;

        const p = Math.min(1, k * 6);

        o.scale.set(size * 3.2 * (0.6 + p * 0.4), size * (0.6 + p * 0.4), 1);
      },
    });
  }

  update(dt: number) {
    this.flashT -= dt;
    if (this.flashT <= 0) {
      this.flash.intensity = Math.max(0, this.flash.intensity - dt * 80);
    }

    let n = 0;

    this.particles = this.particles.filter((p) => (p.age += dt) < p.life);
    for (const p of this.particles) {
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(1 - dt * 1.2);
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.03) {
        p.pos.y = 0.03;
        p.vel.y *= -0.4;
      }

      const k = 1 - p.age / p.life;

      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(p.age * p.spin, p.age * p.spin * 0.7, 0);
      this.dummy.scale.setScalar(p.size * (0.3 + k * 0.7));
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

  cv.width = cv.height = 128;

  const g = context2d(cv);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);

  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(255,255,255,.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // Four-point star flare.
  g.fillStyle = "rgba(255,255,255,.9)";
  g.beginPath();
  g.moveTo(64, 0);
  g.lineTo(70, 58);
  g.lineTo(128, 64);
  g.lineTo(70, 70);
  g.lineTo(64, 128);
  g.lineTo(58, 70);
  g.lineTo(0, 64);
  g.lineTo(58, 58);
  g.closePath();
  g.fill();
  glowTex = new THREE.CanvasTexture(cv);
  glowTex.userData.shared = true;

  return glowTex;
}
