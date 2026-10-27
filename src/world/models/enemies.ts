// Hand-placed model geometry and materials: asset data, exempt from the magic-number and colour gates (R7 revised, David 2026-10-23).
import * as THREE from "three";
import { INK, kit, toon } from "#root/src/world/models/toon.ts";
import { context2d } from "#root/src/dom.ts";
import { nth, present } from "#root/src/nth.ts";
import {
  ROBOT_PAUSE_SECONDS,
  stepEnemy,
  type EnemyMotion,
} from "#root/src/world/motion/enemy-motion.ts";

export type EnemyKind = "spaghetti" | "bug" | "robot";
export const SCORE: Record<EnemyKind, number> = {
  spaghetti: 100,
  bug: 150,
  robot: 500,
};

const HP: Record<EnemyKind, number> = { spaghetti: 2, bug: 1, robot: 5 };
const ROBOT_NAMES = [
  "VIBE-BOT",
  "AUTOPILOT",
  "COPY-PASTA 9000",
  "AGENT 47%",
  "HALLU-CINATOR",
  "TAB-COMPLETE",
  "YOLO-GPT",
  "PR-SPAMMER",
];
const ROBOT_STATES = ["GENERATING…", "THINKING…", "SHIPPING…", "10K LINES/S"];

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The numbers of each kind's animation: data only, read by stepEnemy in enemy-motion.ts. */
const ENEMY_MOTION = {
  spaghetti: {
    hopRate: 5,
    hopHeight: 0.6,
    squash: 0.15,
    swayRate: 2,
    swayAmount: 0.4,
  },
  bug: { legRate: 22, legSwing: 0.5, bob: 0.03 },
  robot: {
    swingRate: 9,
    swingPhase: 1.6,
    swing: 0.6,
    idleArm: -0.9,
    idleRate: 12,
    idleAmount: 0.3,
    nodRate: 5,
    nodAmount: 0.15,
  },
} as const satisfies EnemyMotion;

export class Enemy {
  readonly group = new THREE.Group();
  hp: number;
  age = 0;
  dead = false;
  flash = 0;
  /** Hit sphere radius and centre height. */
  readonly radius: number;
  readonly centerY: number;
  private label?: {
    canvas: HTMLCanvasElement;
    tex: THREE.CanvasTexture;
    name: string;
    state: string;
  };
  readonly parts: Record<string, THREE.Object3D> = {};

  constructor(
    readonly kind: EnemyKind,
    readonly seed: number,
    readonly from: THREE.Vector3,
    readonly to: THREE.Vector3,
    readonly speed: number,
  ) {
    this.hp = HP[kind];
    this.group.position.copy(from);
    if (kind === "spaghetti") {
      this.buildSpaghetti();
      this.radius = 0.85;
      this.centerY = 0.8;
    } else if (kind === "bug") {
      this.buildBug();
      this.radius = 0.6;
      this.centerY = 0.4;
    } else {
      this.buildRobot();
      this.radius = 1.05;
      this.centerY = 1.35;
    }

    this.group.userData.enemy = this;
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData.outline) {
        o.castShadow = true;
      }
    });
  }

  center(out = new THREE.Vector3()) {
    return out
      .copy(this.group.position)
      .setY(this.group.position.y + this.centerY);
  }

  private buildSpaghetti() {
    const a = kit(0.02);
    const noodles = new THREE.Group();

    this.group.add(noodles);
    this.parts.body = noodles;

    let s = this.seed;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;

    for (let i = 0; i < 7; i++) {
      const pts: THREE.Vector3[] = [];

      for (let k = 0; k < 7; k++) {
        pts.push(V((r() - 0.5) * 1.3, 0.25 + r() * 1.1, (r() - 0.5) * 1.1));
      }

      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(pts, true),
          60,
          0.07,
          6,
          true,
        ),
        toon(i % 3 ? "#f3d27a" : "#efc25e"),
      );

      tube.castShadow = true;
      noodles.add(tube);
    }

    a.ball(noodles, "#de6a47", 0, 1.15, 0, 0.42, 0.22, 0.42); // sauce
    a.ball(noodles, "#8b4a3a", 0.25, 1.3, 0.1, 0.18); // meatball
    for (const side of [-1, 1]) {
      a.ball(noodles, "#fffdf0", side * 0.2, 0.85, 0.48, 0.17, 0.2, 0.12);
      a.ball(noodles, INK, side * 0.18, 0.83, 0.58, 0.07, 0.08, 0.04, false);
      a.box(noodles, INK, side * 0.2, 1.06, 0.55, 0.22, 0.05, 0.05).rotation.z =
        side * 0.4;
    }
  }

  private buildBug() {
    const a = kit(0.018);
    const b = new THREE.Group();

    this.group.add(b);
    this.parts.body = b;
    a.ball(b, "#de6a47", 0, 0.38, 0, 0.5, 0.32, 0.6);
    a.box(b, INK, 0, 0.6, 0, 0.04, 0.12, 1.0, false);
    for (const [x, z] of [
      [-0.22, 0.15],
      [0.25, -0.2],
      [-0.2, -0.3],
      [0.2, 0.25],
    ] as const) {
      a.ball(b, INK, x, 0.62, z, 0.1, 0.06, 0.1, false);
    }

    a.ball(b, INK, 0, 0.36, 0.55, 0.28, 0.22, 0.22);
    for (const side of [-1, 1]) {
      a.ball(b, "#fffdf0", side * 0.12, 0.44, 0.72, 0.09);
      a.ball(b, INK, side * 0.12, 0.44, 0.8, 0.045, 0.045, 0.03, false);
      a.link(
        b,
        INK,
        V(side * 0.1, 0.5, 0.7),
        V(side * 0.28, 0.85, 0.95),
        0.025,
      );
      a.ball(b, "#f9db48", side * 0.28, 0.87, 0.97, 0.06, 0.06, 0.06, false);
      for (const z of [-0.3, 0, 0.3]) {
        const leg = new THREE.Group();

        leg.position.set(side * 0.38, 0.3, z);
        b.add(leg);
        a.link(leg, INK, V(0, 0, 0), V(side * 0.3, -0.28, 0), 0.03);
        this.parts[`leg${side}${z}`] = leg;
      }
    }
  }

  private buildRobot() {
    const a = kit(0.02);
    const shell = "#e0ebee";
    const dark = "#233c4c";
    const gold = "#f8c355";
    const cyan = "#76e4f9";
    const body = new THREE.Group();

    body.position.y = 1.0;
    this.group.add(body);
    this.parts.body = body;
    a.soft(body, shell, 0, 0.3, 0, 0.95, 0.85, 0.6);
    a.box(body, dark, 0, 0.32, 0.29, 0.66, 0.5, 0.06);
    for (let i = 0; i < 3; i++) {
      a.box(
        body,
        i === 1 ? "#ff8b69" : cyan,
        -0.2 + i * 0.2,
        0.32,
        0.33,
        0.12,
        0.12,
        0.03,
        false,
      );
    }

    a.box(body, gold, 0, -0.16, 0, 0.7, 0.14, 0.55);

    const head = new THREE.Group();

    head.position.set(0, 0.95, 0);
    body.add(head);
    this.parts.head = head;
    a.soft(head, shell, 0, 0, 0, 0.8, 0.56, 0.56);
    a.soft(head, dark, 0, 0, 0.27, 0.64, 0.36, 0.06);
    for (const side of [-1, 1]) {
      const eye = a.box(
        head,
        cyan,
        side * 0.15,
        0.03,
        0.31,
        0.13,
        0.09,
        0.03,
        false,
      );

      eye.material = toon(cyan, "#278caf", 0.8);
      a.cyl(head, gold, side * 0.42, 0, 0, 0.1, 0.08).rotation.z = Math.PI / 2;
    }

    a.box(head, gold, 0, -0.11, 0.31, 0.2, 0.03, 0.02, false);
    a.cyl(head, gold, 0, 0.42, 0, 0.03, 0.3, false);

    const bulb = a.ball(head, cyan, 0, 0.6, 0, 0.09);

    bulb.material = toon(cyan, "#278caf", 1);
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();

      arm.position.set(side * 0.58, 0.52, 0);
      body.add(arm);
      this.parts[`arm${side}`] = arm;
      a.ball(arm, gold, 0, 0, 0, 0.14);
      a.soft(arm, shell, side * 0.04, -0.32, 0, 0.22, 0.48, 0.24);
      a.soft(arm, dark, side * 0.06, -0.62, 0.04, 0.26, 0.2, 0.28);

      const leg = new THREE.Group();

      leg.position.set(side * 0.24, -0.25, 0);
      body.add(leg);
      this.parts[`leg${side}`] = leg;
      a.box(leg, dark, 0, -0.25, 0, 0.2, 0.5, 0.22);
      a.soft(leg, gold, side * 0.03, -0.62, 0.08, 0.36, 0.2, 0.5);
    }

    // Name tag floating overhead.
    const canvas = document.createElement("canvas");

    canvas.width = 512;
    canvas.height = 128;

    const tex = new THREE.CanvasTexture(canvas);

    tex.colorSpace = THREE.SRGBColorSpace;

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        depthTest: false,
        toneMapped: false,
      }),
    );

    sprite.scale.set(2.4, 0.6, 1);
    sprite.position.set(0, 2.95, 0);
    sprite.renderOrder = 40;
    this.group.add(sprite);
    sprite.userData.outline = true; // not debris
    this.label = {
      canvas,
      tex,
      name: nth(ROBOT_NAMES, this.seed % ROBOT_NAMES.length, "robot names"),
      state: "",
    };
  }

  part(name: string): THREE.Object3D {
    return present(this.parts[name], `the robot part "${name}"`);
  }

  drawLabel(state: string) {
    const l = present(this.label, "the robot label");

    if (l.state === state) {
      return;
    }

    l.state = state;

    const g = context2d(l.canvas);

    g.clearRect(0, 0, 512, 128);
    g.fillStyle = "#173849";
    g.beginPath();
    g.roundRect(4, 4, 504, 120, 18);
    g.fill();
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "600 46px ui-monospace, Menlo, monospace";
    g.fillStyle = "#fff1be";
    g.fillText(l.name, 256, 44);
    g.font = "600 28px ui-monospace, Menlo, monospace";
    g.fillStyle = "#b4e7e7";
    g.fillText(
      `${state} · ${"■".repeat(this.hp)}${"□".repeat(HP.robot - this.hp)}`,
      256,
      94,
    );
    l.tex.needsUpdate = true;
  }

  update(dt: number, facing: THREE.Vector3) {
    stepEnemy(this, ENEMY_MOTION, dt, facing);
  }

  /** What the robot's label says while it stands and thinks: the states, one a second. */
  thinking(t: number) {
    return nth(
      ROBOT_STATES,
      Math.floor(t) % ROBOT_STATES.length,
      "robot states",
    );
  }

  /** Returns true when this hit kills it. */
  hit(): boolean {
    this.hp--;
    this.flash = 1;
    if (this.label) {
      this.label.state = "";
    }

    return this.hp <= 0;
  }

  get finished() {
    return (
      (this.age - (this.kind === "robot" ? ROBOT_PAUSE_SECONDS : 0)) *
        this.speed >=
      this.from.distanceTo(this.to)
    );
  }
}
