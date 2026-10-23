import * as THREE from "three";
import { gateLabel } from "../content/gatelabel";
import { ROAD_HALF } from "./city";
import { kit } from "./toon";
import { isDrawable, mapOf } from "./objects";
import { context2d } from "../dom";
import { GATE } from "./palette";
import { GATE_SCHEMA } from "./gate-model";
import gateJson from "./gate.json";

/** Where every part of the gate sits and how big it is: gate.json, checked on the way in. */
const MODEL = GATE_SCHEMA.read(gateJson, "gate");

export type GateState = "idle" | "alarm" | "open" | "broken";

/** A checkpoint arch over the road: pillars, a sign with the gate's name, a boom barrier and a status light. */
export class Gate {
  readonly group = new THREE.Group();
  private readonly boom = new THREE.Group();
  /** The near pillar, beam, sign and light: hidden when the camera looks across the street. */
  readonly near = new THREE.Group();
  private readonly light: THREE.Mesh;
  private readonly lightMat = new THREE.MeshBasicMaterial({
    color: "#de6a47",
    toneMapped: false,
  });
  private readonly check: THREE.Mesh;
  state: GateState = "idle";
  private boomAngle = 0;
  private t = 0;

  constructor(label: string, z: number) {
    const a = kit(0.025);

    this.group.position.z = z;

    const x = ROAD_HALF + MODEL.pillar.margin;

    this.group.add(this.near);
    for (const s of [-1, 1]) {
      const g = s > 0 ? this.near : this.group;

      for (const part of MODEL.pillar.parts) {
        for (const at of part.at) {
          a[part.shape](
            g,
            GATE[part.colour],
            s * x + at.x,
            at.y,
            at.z,
            part.size.x,
            part.size.y,
            part.size.z,
            part.outlined,
          );
        }
      }
    }

    const beam = MODEL.beam;

    a.soft(
      this.near,
      GATE[beam.colour],
      0,
      beam.at.y,
      0,
      x * 2 + beam.overhang,
      beam.size.y,
      beam.size.z,
    );

    // The sign, readable from both directions.
    const cv = document.createElement("canvas");

    cv.width = 1024;
    cv.height = 200;

    const g = context2d(cv);

    g.fillStyle = "#173e35";
    g.beginPath();
    g.roundRect(0, 0, 1024, 200, 26);
    g.fill();
    g.strokeStyle = "#f9db48";
    g.lineWidth = 10;
    g.beginPath();
    g.roundRect(8, 8, 1008, 184, 20);
    g.stroke();

    // A number badge, then the title.
    const { num, title } = gateLabel(label);
    let left = 40;

    if (num) {
      g.fillStyle = "#f9db48";
      g.beginPath();
      g.roundRect(28, 22, 190, 156, 22);
      g.fill();
      g.fillStyle = "#173e35";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = "700 26px Space, Arial, sans-serif";
      g.fillText("GATE", 123, 52);
      g.font = `italic 800 ${num.length > 2 ? 84 : 104}px Barlow, Impact, sans-serif`;
      g.fillText(num, 123, 118);
      left = 240;
    }

    g.fillStyle = "#f9db48";
    g.textAlign = "center";
    g.textBaseline = "middle";

    const room = 1024 - left - 36;
    let size = 112;

    do {
      g.font = `italic 800 ${size}px Barlow, Impact, sans-serif`;
      size -= 4;
    } while (g.measureText(title).width > room && size > 40);

    g.fillText(title, left + room / 2, 106);

    const tex = new THREE.CanvasTexture(cv);

    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(MODEL.sign.width, MODEL.sign.height),
      new THREE.MeshBasicMaterial({
        map: tex,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );

    sign.position.set(0, MODEL.sign.at.y, MODEL.sign.at.z);
    this.near.add(sign);

    const posts = MODEL.signPosts;

    for (const at of posts.at) {
      a.box(
        this.near,
        GATE[posts.colour],
        at.x,
        at.y,
        at.z,
        posts.size.x,
        posts.size.y,
        posts.size.z,
        posts.outlined,
      );
    }

    // Status light on top.
    const light = MODEL.light;

    this.light = new THREE.Mesh(
      new THREE.SphereGeometry(
        light.radius,
        light.widthSegments,
        light.heightSegments,
      ),
      this.lightMat,
    );
    this.light.position.set(0, light.at.y, 0);
    this.near.add(this.light);

    const check = MODEL.check;

    this.check = new THREE.Mesh(
      new THREE.TorusGeometry(
        check.radius,
        check.tube,
        check.radialSegments,
        check.tubularSegments,
      ),
      new THREE.MeshBasicMaterial({
        color: GATE[check.colour],
        toneMapped: false,
      }),
    );
    this.check.position.copy(this.light.position);
    this.check.visible = false;
    this.near.add(this.check);
    // Boom barrier hinged at the left pillar.

    const boom = MODEL.boom;

    this.boom.position.set(-x + boom.hinge.inset, boom.hinge.y, 0);
    this.group.add(this.boom);
    for (let i = 0; i < boom.count; i++) {
      a.box(
        this.boom,
        GATE[boom.colours[i % boom.colours.length] ?? "boomStripeGap"],
        boom.start + i * boom.length,
        0,
        0,
        boom.length,
        boom.size.y,
        boom.size.z,
        i === 0 ? boom.outlinedFirst : boom.outlinedRest,
      );
    }
  }

  update(dt: number) {
    this.t += dt;

    const target =
      this.state === "open"
        ? Math.PI / 2 - 0.05
        : this.state === "broken"
          ? -0.5
          : 0;

    this.boomAngle += (target - this.boomAngle) * (1 - Math.exp(-dt * 6));
    this.boom.rotation.z = this.boomAngle;
    this.boom.rotation.x = this.state === "broken" ? 0.35 : 0;

    const on = this.state === "alarm" ? Math.sin(this.t * 10) > 0 : true;

    this.lightMat.color.set(
      this.state === "open"
        ? "#8ef08a"
        : this.state === "idle"
          ? "#ffd96a"
          : on
            ? "#ff5d4f"
            : "#7c2f33",
    );
    this.check.visible = this.state === "open";
    this.check.rotation.y += dt * 2;
  }

  dispose() {
    this.group.traverse((o) => {
      if (!isDrawable(o)) {
        return;
      }

      if (!o.geometry.userData.shared) {
        o.geometry.dispose();
      }

      const mat = o.material;

      if (!Array.isArray(mat) && !mat.userData.shared) {
        mapOf(mat)?.dispose();
        mat.dispose();
      }
    });
    this.group.removeFromParent();
  }
}

export { toon as gateToon } from "./toon";
