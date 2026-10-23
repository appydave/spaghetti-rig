import * as THREE from "three";
import { gateLabel } from "../content/gatelabel";
import { ROAD_HALF } from "./city";
import { INK, kit } from "./toon";
import { isDrawable, mapOf } from "./objects";
import { context2d } from "../dom";

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
    const x = ROAD_HALF + 0.5;
    this.group.add(this.near);
    for (const s of [-1, 1]) {
      const g = s > 0 ? this.near : this.group;
      a.soft(g, "#f4f4e8", s * x, 2.4, 0, 0.6, 4.8, 0.6);
      for (const y of [0.8, 1.8, 2.8, 3.8])
        a.box(g, INK, s * x, y, 0, 0.64, 0.18, 0.64, false);
      a.soft(g, "#7fae8f", s * x, 0.2, 0, 0.9, 0.4, 0.9);
    }
    a.soft(this.near, "#f9db48", 0, 5.0, 0, x * 2 + 1.0, 0.7, 0.7);
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
      new THREE.PlaneGeometry(5.6, 1.1),
      new THREE.MeshBasicMaterial({
        map: tex,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    sign.position.set(0, 6.0, 0.05);
    this.near.add(sign);
    a.box(this.near, INK, -2, 5.45, 0, 0.08, 0.5, 0.08, false);
    a.box(this.near, INK, 2, 5.45, 0, 0.08, 0.5, 0.08, false);
    // Status light on top.
    this.light = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 12),
      this.lightMat,
    );
    this.light.position.set(0, 7.0, 0);
    this.near.add(this.light);
    this.check = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.06, 8, 24),
      new THREE.MeshBasicMaterial({ color: "#aee5a3", toneMapped: false }),
    );
    this.check.position.copy(this.light.position);
    this.check.visible = false;
    this.near.add(this.check);
    // Boom barrier hinged at the left pillar.
    this.boom.position.set(-x + 0.3, 1.25, 0);
    this.group.add(this.boom);
    for (let i = 0; i < 7; i++)
      a.box(
        this.boom,
        i % 2 ? "#de6a47" : "#f4f4e8",
        0.5 + i * 0.95,
        0,
        0,
        0.95,
        0.22,
        0.18,
        i === 0,
      );
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
      if (!isDrawable(o)) return;
      if (!o.geometry.userData.shared) o.geometry.dispose();
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
