// Hand-placed model geometry and materials: asset data, exempt from the magic-number and colour gates (R7 revised, David 2026-10-23).
import * as THREE from "three";
import { Character } from "#root/src/world/models/characters.ts";
import { layoutCard } from "#root/src/world/code-window/codelayout.ts";
import { CodeWindow } from "#root/src/world/code-window/codewindow.ts";
import { paintCard } from "#root/src/world/code-window/paint/card-painter.ts";
import { kit } from "#root/src/world/models/kit/kit.ts";
import type { Player } from "#root/src/content/script.ts";
import type { Card } from "#root/src/content/types.ts";
import { userData } from "#root/src/world/models/objects.ts";
import { context2d } from "#root/src/dom.ts";
import { nth } from "#root/src/nth.ts";

function lights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight("#e4f7ff", "#586d55", 2.3));

  const sun = new THREE.DirectionalLight("#fff0c1", 2.8);

  sun.position.set(1.5, 10, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
  scene.add(sun);

  const rim = new THREE.DirectionalLight("#93cfff", 1.4);

  rim.position.set(-6, 3, -4);
  scene.add(rim);
}

/** A soft contact shadow under a character's feet. */
function blob(x: number, y: number, z: number, r: number) {
  const cv = document.createElement("canvas");

  cv.width = cv.height = 128;

  const g = context2d(cv);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);

  grad.addColorStop(0, "rgba(23,62,53,.38)");
  grad.addColorStop(0.6, "rgba(23,62,53,.16)");
  grad.addColorStop(1, "rgba(23,62,53,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(r * 2, r * 1.2),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    }),
  );

  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);

  return m;
}

function snippet(lines: string[], title: string): Card {
  return {
    id: "",
    title,
    blocks: [{ view: "code", rows: lines.map((l): ["c", string] => ["c", l]) }],
    annotations: [
      {
        block: 0,
        row: 1,
        match: nth(lines, 1, "snippet lines").trim(),
        kind: "problem",
        note: "",
      },
    ],
  };
}

/** The title screen's hero: the specialist and his cannon, angry code windows flying in. */
const shadowOf = (root: THREE.Object3D) =>
  userData(root, "shadow", THREE.Object3D);

export class TitleShowcase {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100);
  private readonly hero = new Character("p2");
  private readonly sidekick = new Character("p1");
  private readonly windows: CodeWindow[] = [];
  private t = 0;

  constructor() {
    lights(this.scene);
    this.hero.root.scale.setScalar(1.6);
    this.hero.root.position.set(2.2, -1.6, 0);
    this.hero.root.rotation.y = Math.PI / 2 + 0.95;
    this.hero.pose = "aim";
    this.sidekick.root.position.set(4.6, -1.5, -3.2);
    this.sidekick.root.rotation.y = Math.PI / 2 + 0.2;
    this.sidekick.pose = "idle";
    this.scene.add(this.hero.root, this.sidekick.root);
    this.scene.add(blob(2.2, -1.68, 0.1, 1.5), blob(4.6, -1.55, -3.1, 0.9));

    const cards: [Card, "angry" | "calm", number, number, number, number][] = [
      [
        snippet(
          [
            "async function doTheThingAgain(x: any) {",
            "  if (!!why === !false) {",
            "    return new Promise((ok) =>",
            "      setTimeout(() => ok(x), 0));",
            '  } else throw "works on my machine";',
            "}",
          ],
          "utils-final-v9.ts",
        ),
        "angry",
        -0.6,
        2.2,
        -1.5,
        3.4,
      ],
      [
        snippet(
          [
            "const AMMO = [null, undefined, NaN];",
            "  for (let i = 0; i < 999999; i++) {",
            "  v = v ? !!v : v; }",
          ],
          "factory-factory.ts",
        ),
        "calm",
        4.4,
        2.7,
        -4.5,
        3,
      ],
      [
        snippet(
          [
            "function load( rig ){",
            "if(!rig) {return null}",
            "  return {name:rig.name}}",
          ],
          "rigs.ts",
        ),
        "angry",
        -2.8,
        -0.3,
        0.2,
        2.4,
      ],
    ];

    for (const [card, mood, x, y, z, w] of cards) {
      const cv = paintCard(layoutCard(card, 40, card.title), mood, {
        label: mood === "angry" ? "Tech debt detected" : "Legacy",
        title: card.title.replace(/\..*$/, ""),
      });
      const win = new CodeWindow(cv, w, mood);

      win.group.position.set(x, y, z);
      win.group.userData.home = new THREE.Vector3(x, y, z);
      win.group.rotation.set(-0.08, 0.35, mood === "angry" ? 0.08 : -0.06);
      this.windows.push(win);
      this.scene.add(win.group);
    }

    // A few floating braces and a lightning bolt, chunky and yellow.
    const a = kit(0.03);
    const bolt = a.extrude(
      this.scene,
      "#f9db48",
      [
        [0, 0.6],
        [-0.35, -0.05],
        [-0.05, -0.05],
        [-0.2, -0.6],
        [0.35, 0.1],
        [0.05, 0.1],
      ],
      0.18,
      0,
      0.03,
    );

    bolt.position.set(-2.6, 3.4, -1);
    bolt.userData.spin = 1;
    this.camera.position.set(0.8, 1.2, 14.5);
    this.camera.lookAt(0.8, 1.3, 0);
  }

  update(dt: number) {
    this.t += dt;
    this.hero.aimAt(
      nth(this.windows, 0, "showcase windows")
        .group.position.clone()
        .add(new THREE.Vector3(0, -0.6, 0)),
    );
    this.hero.update(dt);
    this.sidekick.update(dt);
    for (const [i, w] of this.windows.entries()) {
      const home = userData(w.group, "home", THREE.Vector3);

      w.group.position.set(
        home.x + Math.sin(this.t * 0.7 + i) * 0.12,
        home.y + Math.sin(this.t * 1.1 + i * 2) * 0.18,
        home.z,
      );
      w.group.rotation.y = 0.35 + Math.sin(this.t * 0.5 + i) * 0.08;
      w.update(dt);
    }

    this.scene.traverse((o) => {
      if (o.userData.spin) {
        o.rotation.y += dt * 1.5;
      }
    });
    if (Math.sin(this.t * 2.3) > 0.97) {
      this.hero.fire();
    }
  }

  /** Shift the hero so he sits on the right of whatever aspect the screen is. */
  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.setViewOffset(
      1000 * aspect,
      1000,
      -1000 * aspect * 0.22,
      0,
      1000 * aspect,
      1000,
    );
    this.camera.updateProjectionMatrix();
  }
}

/** Street Fighter-style face-off: the two developers square up. One player alone gets a solo intro. */
export class VsShowcase {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
  readonly p1 = new Character("p1");
  readonly p2 = new Character("p2");
  /** The one player shown in a single-player tier intro; null for the face-off. */
  solo: Player | null = null;
  private t = 0;

  constructor() {
    lights(this.scene);
    for (const [c, x, ry] of [
      [this.p1, -2.1, -Math.PI / 2 - 0.85],
      [this.p2, 2.1, Math.PI / 2 + 0.85],
    ] as const) {
      c.root.position.set(x, -1.4, 0);
      c.root.rotation.y = ry;
      c.root.scale.setScalar(1.45);
      c.pose = "idle";
      this.scene.add(c.root);

      const shadow = blob(x, -1.5, 0, 1.3);

      shadow.name = "shadow";
      c.root.userData.shadow = shadow;
      this.scene.add(shadow);
    }

    this.camera.position.set(0, 1.4, 13);
    this.camera.lookAt(0, 1.6, 0);
  }

  /** Restart the slide-in. */
  reset() {
    this.t = 0;
  }

  update(dt: number) {
    this.t += dt;

    const k = Math.min(1, this.t / 0.45);
    const e = 1 - Math.pow(1 - k, 3);

    if (this.solo) {
      this.updateSolo(dt, e);

      return;
    }

    for (const c of [this.p1, this.p2]) {
      c.root.visible = true;
      shadowOf(c.root).visible = true;
      c.root.scale.setScalar(1.45);
    }

    this.p1.root.rotation.y = -Math.PI / 2 - 0.85;
    this.p2.root.rotation.y = Math.PI / 2 + 0.85;
    this.p1.root.position.x = -2.1 - (1 - e) * 6;
    this.p2.root.position.x = 2.1 + (1 - e) * 6;
    for (const c of [this.p1, this.p2]) {
      shadowOf(c.root).position.x = c.root.position.x;
    }

    this.p1.pose = this.t > 0.6 ? "aim" : "walk";
    this.p2.pose = this.t > 0.6 ? "aim" : "walk";
    this.p1.aimAt(this.p2.root.position.clone().setY(1.5));
    this.p2.aimAt(this.p1.root.position.clone().setY(1.5));
    this.p1.update(dt);
    this.p2.update(dt);
  }

  /** One character, big, on the right; the tier and the boss's name sit on the left in the HUD. */
  private updateSolo(dt: number, e: number) {
    const me = this.solo === "p1" ? this.p1 : this.p2;
    const other = this.solo === "p1" ? this.p2 : this.p1;

    other.root.visible = false;
    shadowOf(other.root).visible = false;
    me.root.visible = true;
    shadowOf(me.root).visible = true;
    me.root.scale.setScalar(1.75);
    me.root.position.x = 2.6 + (1 - e) * 7;
    me.root.rotation.y = Math.PI - 0.6; // towards the camera, glancing left at the words
    shadowOf(me.root).position.x = me.root.position.x;
    me.pose = this.t > 0.6 ? "aim" : "walk";
    me.aimAt(new THREE.Vector3(-6, 2.2, 3));
    me.update(dt);
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.position.z = aspect < 1.4 ? 16 : 13;
    this.camera.updateProjectionMatrix();
  }
}
