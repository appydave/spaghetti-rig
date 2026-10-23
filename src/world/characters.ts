import * as THREE from "three";
import { INK, kit, toon, clamp01, lerp } from "./toon";

export type Pose = "idle" | "walk" | "hurt" | "down" | "victory" | "aim";
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * A chunky, bobble-headed toy character facing -Z. The rig: root → hips → (legs, upper → arms, head, weapon).
 * `upper` turns to aim; `muzzle` is where shots leave.
 */
export class Character {
  readonly root = new THREE.Group();
  readonly hips = new THREE.Group();
  readonly upper = new THREE.Group();
  readonly head = new THREE.Group();
  readonly legL = new THREE.Group();
  readonly legR = new THREE.Group();
  readonly weapon = new THREE.Group();
  readonly muzzle = new THREE.Object3D();
  pose: Pose = "idle";
  private t = 0;
  private recoil = 0;
  private hurtKick = 0;
  private downT = 0;
  private aimYaw = 0;
  private aimPitch = 0;
  private targetYaw = 0;
  private targetPitch = 0;

  constructor(readonly kind: "p1" | "p2") {
    this.root.name = kind === "p1" ? "vibe-coder" : "quality-specialist";
    this.root.add(this.hips);
    this.hips.position.y = 0.92;
    this.hips.add(this.legL, this.legR, this.upper);
    this.legL.position.set(-0.15, 0, 0);
    this.legR.position.set(0.15, 0, 0);
    this.upper.add(this.head, this.weapon);
    this.weapon.add(this.muzzle);
    if (kind === "p2") buildSpecialist(this);
    else buildVibeCoder(this);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.userData.outline) o.castShadow = true;
    });
  }

  /** Point the upper body at a world position (clamped, so they never twist their spine off). */
  aimAt(world: THREE.Vector3 | null) {
    if (!world) {
      this.targetYaw = 0;
      this.targetPitch = 0;
      return;
    }
    const local = this.root.worldToLocal(world.clone());
    const from = V(0, 1.25, 0);
    const d = local.sub(from);
    this.targetYaw = THREE.MathUtils.clamp(Math.atan2(-d.x, -d.z), -0.9, 0.9);
    this.targetPitch = THREE.MathUtils.clamp(
      Math.atan2(d.y, Math.hypot(d.x, d.z)),
      -0.35,
      0.5,
    );
  }

  fire() {
    this.recoil = 1;
  }
  hit() {
    this.hurtKick = 1;
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.hurtKick = Math.max(0, this.hurtKick - dt * 2.2);
    const k = 1 - Math.exp(-dt * 10);
    this.aimYaw = lerp(this.aimYaw, this.targetYaw, k);
    this.aimPitch = lerp(this.aimPitch, this.targetPitch, k);

    let legSwing = 0,
      bob = 0,
      lean = 0,
      headTilt = 0,
      armUp = 0,
      rootTilt = 0,
      rootY = 0;
    switch (this.pose) {
      case "walk":
        legSwing = Math.sin(t * 8.5) * 0.55;
        bob = Math.abs(Math.cos(t * 8.5)) * 0.06;
        lean = 0.06;
        break;
      case "idle":
      case "aim":
        bob = Math.sin(t * 2.2) * 0.012;
        headTilt = Math.sin(t * 1.3) * 0.04;
        break;
      case "hurt":
        bob = Math.sin(t * 3) * 0.01;
        lean = -0.12;
        headTilt = 0.18 + Math.sin(t * 5) * 0.05;
        break;
      case "victory":
        bob = Math.abs(Math.sin(t * 5)) * 0.18;
        armUp = 0.8;
        headTilt = -0.15;
        break;
      case "down":
        break;
    }
    this.downT =
      this.pose === "down"
        ? Math.min(1, this.downT + dt * 2.2)
        : Math.max(0, this.downT - dt * 3);
    const fall = this.downT < 1 ? 1 - Math.pow(1 - this.downT, 2) : 1;
    rootTilt = fall * (Math.PI / 2 - 0.06);
    rootY =
      fall * 0.28 +
      (this.downT > 0 && this.downT < 1
        ? Math.sin(this.downT * Math.PI) * 0.25
        : 0);

    this.legL.rotation.x = legSwing;
    this.legR.rotation.x = -legSwing;
    this.hips.position.y = 0.92 + bob;
    this.root.rotation.x = rootTilt; // falls on their back
    this.root.position.y = rootY;
    const hurt = this.hurtKick;
    this.upper.rotation.x =
      -lean +
      this.aimPitch * 0.6 -
      hurt * 0.45 +
      this.recoil * -0.06 -
      armUp * 0.15;
    this.upper.rotation.y = this.aimYaw * 0.8 + Math.sin(hurt * 9) * hurt * 0.2;
    this.head.rotation.x = -headTilt - hurt * 0.25;
    this.head.rotation.z = Math.sin(t * 1.7) * 0.03;
    this.weapon.rotation.x =
      this.aimPitch * 0.4 + this.recoil * 0.22 + armUp * 0.45;
    this.weapon.position.z = this.recoil * 0.08;
  }

  /** World position of the muzzle. */
  muzzleWorld(out = new THREE.Vector3()) {
    return this.muzzle.getWorldPosition(out);
  }
  /** World position of the chest, where code windows hit. */
  chestWorld(out = new THREE.Vector3()) {
    return this.upper.localToWorld(out.set(0, 0.35, 0));
  }
}

function buildSpecialist(c: Character) {
  const a = kit(0.018);
  const white = "#fffdf0",
    shade = "#d7e7de",
    dark = "#183e3e",
    skin = "#efb68b",
    skinLight = "#f9cca1",
    yellow = "#f2c746";
  // Legs: white trousers, chunky polished ink shoes.
  for (const [leg, s] of [
    [c.legL, -1],
    [c.legR, 1],
  ] as const) {
    a.capsule(leg, white, V(0, -0.02, 0), V(s * 0.01, -0.62, 0.02), 0.115);
    a.soft(leg, dark, s * 0.01, -0.82, -0.06, 0.26, 0.17, 0.42);
    a.box(leg, "#608b80", s * 0.01, -0.9, -0.06, 0.25, 0.03, 0.4, false);
  }
  // Blazer, shirt, tie.
  const u = c.upper;
  a.soft(u, white, 0, 0.32, 0, 0.66, 0.66, 0.42);
  a.soft(u, shade, 0, 0.0, 0, 0.6, 0.16, 0.4);
  a.box(u, "#e4efe5", 0, 0.46, -0.205, 0.2, 0.32, 0.03, false);
  a.extrude(
    u,
    yellow,
    [
      [-0.035, 0.6],
      [0.035, 0.6],
      [0.05, 0.36],
      [0, 0.26],
      [-0.05, 0.36],
    ],
    0.03,
    -0.25,
    0.006,
  ).rotation.y = Math.PI;
  for (const s of [-1, 1])
    a.box(u, white, s * 0.09, 0.5, -0.215, 0.07, 0.3, 0.02).rotation.z =
      s * 0.35;
  a.box(u, "#75b6a0", -0.18, 0.4, -0.215, 0.1, 0.13, 0.02).rotation.z = 0.12; // quality-check badge
  a.ball(u, "#aee5a3", -0.18, 0.42, -0.23, 0.025, 0.025, 0.01, false);
  // Arms reach forward to the cannon.
  a.capsule(u, white, V(-0.36, 0.52, 0), V(-0.3, 0.24, -0.25), 0.1);
  a.capsule(u, white, V(-0.3, 0.24, -0.25), V(0.04, 0.2, -0.42), 0.09);
  a.ball(u, skinLight, 0.06, 0.2, -0.44, 0.08);
  a.capsule(u, white, V(0.36, 0.52, 0), V(0.42, 0.22, -0.1), 0.1);
  a.capsule(u, white, V(0.42, 0.22, -0.1), V(0.3, 0.1, -0.26), 0.09);
  a.ball(u, skinLight, 0.29, 0.1, -0.3, 0.085);
  // Head: big and round, swept dark hair, glasses.
  c.head.position.set(0, 0.86, 0);
  const h = c.head;
  a.cyl(u, skin, 0, 0.7, 0, 0.09, 0.14, false);
  a.ball(h, skinLight, 0, 0.12, 0, 0.34, 0.37, 0.32);
  a.ball(h, skin, -0.33, 0.1, 0.02, 0.07, 0.1, 0.06);
  a.ball(h, skin, 0.33, 0.1, 0.02, 0.07, 0.1, 0.06);
  a.ball(h, skin, 0, 0.06, -0.33, 0.065, 0.09, 0.07);
  for (const s of [-1, 1]) {
    a.ball(h, dark, s * 0.12, 0.16, -0.3, 0.03, 0.045, 0.02, false);
    const frame = new THREE.Mesh(
      new THREE.TorusGeometry(0.095, 0.022, 8, 4, Math.PI * 2),
      toon(dark),
    );
    frame.rotation.z = Math.PI / 4;
    frame.scale.set(1.15, 0.95, 1);
    frame.position.set(s * 0.13, 0.16, -0.33);
    h.add(frame);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.1, 4),
      new THREE.MeshBasicMaterial({
        color: "#d5ffff",
        transparent: true,
        opacity: 0.35,
      }),
    );
    lens.rotation.set(0, Math.PI, Math.PI / 4);
    lens.scale.set(1.1, 0.9, 1);
    lens.position.set(s * 0.13, 0.16, -0.335);
    h.add(lens);
    a.box(h, dark, s * 0.27, 0.16, -0.17, 0.02, 0.02, 0.28, false); // arms of the glasses
    a.box(h, dark, s * 0.13, 0.31, -0.29, 0.13, 0.03, 0.03, false).rotation.z =
      s * -0.12; // eyebrows
  }
  a.box(h, dark, 0, 0.17, -0.34, 0.07, 0.02, 0.02, false);
  // A confident smile.
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.07, 0.016, 6, 16, Math.PI),
    toon("#7b3b35"),
  );
  smile.rotation.set(0, Math.PI, Math.PI);
  smile.position.set(0.02, -0.04, -0.31);
  h.add(smile);
  // Swept pompadour.
  a.ball(h, dark, 0, 0.36, 0.06, 0.34, 0.2, 0.32);
  a.ball(h, dark, 0.06, 0.48, -0.08, 0.3, 0.14, 0.26).rotation.z = -0.25;
  a.ball(h, dark, 0.18, 0.44, -0.18, 0.18, 0.12, 0.16).rotation.z = 0.3;
  a.ball(h, "#2a5350", 0.02, 0.5, -0.22, 0.2, 0.05, 0.08, false).rotation.z =
    0.15;
  a.box(h, dark, -0.3, 0.2, 0.02, 0.07, 0.24, 0.14);
  a.box(h, dark, 0.3, 0.2, 0.02, 0.07, 0.24, 0.14);
  a.ball(h, dark, 0, 0.2, 0.2, 0.3, 0.28, 0.16);
  // The mint-and-yellow refactor cannon, held at the hip.
  const w = c.weapon;
  w.position.set(0.2, 0.18, -0.3);
  const body = a.cyl(w, "#72c8ad", 0, 0, -0.18, 0.15, 0.5);
  body.rotation.x = Math.PI / 2;
  a.soft(w, "#f3cb48", 0, -0.02, 0.12, 0.26, 0.28, 0.22);
  a.box(w, "#244b48", 0, -0.2, 0.12, 0.1, 0.18, 0.1).rotation.x = 0.25;
  a.box(w, "#f7de73", 0, 0.13, -0.16, 0.16, 0.06, 0.36);
  const collar = a.cyl(w, "#f4d05a", 0, 0, -0.46, 0.17, 0.1);
  collar.rotation.x = Math.PI / 2;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.12, 0.04, 8, 20),
    toon("#d1ebd9"),
  );
  ring.position.z = -0.56;
  w.add(ring);
  const bore = new THREE.Mesh(
    new THREE.CircleGeometry(0.11, 16),
    new THREE.MeshBasicMaterial({ color: "#10332f" }),
  );
  bore.position.z = -0.555;
  bore.rotation.y = Math.PI;
  w.add(bore);
  for (const z of [-0.1, -0.28])
    a.box(w, "#b2eed0", 0.14, 0, z, 0.03, 0.09, 0.07, false);
  c.muzzle.position.set(0, 0, -0.62);
}

function buildVibeCoder(c: Character) {
  const a = kit(0.018);
  const hoodie = "#ee8a5c",
    hoodieDark = "#cf6b45",
    jeans = "#547e92",
    skin = "#e9a77d",
    skinLight = "#f5bf95",
    hair = "#4a2f2a",
    phones = "#f9db48";
  for (const [leg, s] of [
    [c.legL, -1],
    [c.legR, 1],
  ] as const) {
    a.capsule(leg, jeans, V(0, -0.02, 0), V(s * 0.02, -0.62, 0.02), 0.12);
    a.soft(leg, "#f4f4e8", s * 0.02, -0.8, -0.07, 0.27, 0.2, 0.44);
    a.box(leg, "#de6a47", s * 0.02, -0.89, -0.07, 0.28, 0.05, 0.45, false);
    a.box(leg, "#de6a47", s * 0.13, -0.78, -0.04, 0.02, 0.06, 0.2, false);
  }
  const u = c.upper;
  // Oversized hoodie with kangaroo pocket, drawstrings and the hood down.
  a.soft(u, hoodie, 0, 0.3, 0, 0.72, 0.7, 0.46);
  a.soft(u, hoodieDark, 0, 0.0, 0, 0.66, 0.14, 0.44);
  a.soft(u, hoodieDark, 0, 0.12, -0.22, 0.4, 0.18, 0.06);
  const hood = a.ball(u, hoodieDark, 0, 0.62, 0.2, 0.3, 0.16, 0.18);
  hood.rotation.x = 0.4;
  for (const s of [-1, 1]) {
    a.cyl(u, "#f4f4e8", s * 0.07, 0.48, -0.24, 0.012, 0.22, false);
    a.ball(u, "#f4f4e8", s * 0.07, 0.36, -0.24, 0.025, 0.025, 0.025, false);
  }
  a.ball(u, "#f9db48", 0.18, 0.46, -0.235, 0.06, 0.06, 0.015, false); // "SHIP IT" pin
  // Energy drink on the belt loop.
  a.cyl(u, "#de6a47", -0.38, -0.02, -0.05, 0.06, 0.18);
  a.cyl(u, "#c8d6d0", -0.38, 0.08, -0.05, 0.055, 0.02, false);
  // Arms hold the laptop out in front, like a tray.
  a.capsule(u, hoodie, V(-0.38, 0.5, 0), V(-0.36, 0.2, -0.22), 0.11);
  a.capsule(u, hoodie, V(-0.36, 0.2, -0.22), V(-0.2, 0.14, -0.44), 0.1);
  a.ball(u, skinLight, -0.18, 0.13, -0.47, 0.075);
  a.capsule(u, hoodie, V(0.38, 0.5, 0), V(0.36, 0.2, -0.22), 0.11);
  a.capsule(u, hoodie, V(0.36, 0.2, -0.22), V(0.2, 0.14, -0.44), 0.1);
  a.ball(u, skinLight, 0.18, 0.13, -0.47, 0.075);
  // Head: big, messy hair, enormous headphones, dazzled grin.
  c.head.position.set(0, 0.86, 0);
  const h = c.head;
  a.cyl(u, skin, 0, 0.7, 0, 0.09, 0.14, false);
  a.ball(h, skinLight, 0, 0.12, 0, 0.34, 0.37, 0.32);
  a.ball(h, skin, 0, 0.05, -0.33, 0.06, 0.08, 0.06);
  for (const s of [-1, 1]) {
    // Wide happy eyes lit by the screen.
    a.ball(h, "#fffdf0", s * 0.12, 0.17, -0.285, 0.06, 0.07, 0.03, false);
    a.ball(h, INK, s * 0.12, 0.16, -0.31, 0.032, 0.04, 0.02, false);
    a.ball(h, "#ffffff", s * 0.11, 0.18, -0.325, 0.01, 0.01, 0.01, false);
    a.box(h, hair, s * 0.13, 0.3, -0.29, 0.12, 0.03, 0.03, false).rotation.z =
      s * 0.2;
    a.ball(h, "#f39a8a", s * 0.21, 0.04, -0.25, 0.05, 0.03, 0.02, false); // blush
  }
  const grin = new THREE.Mesh(
    new THREE.CircleGeometry(0.08, 16, 0, Math.PI),
    toon("#7b3b35"),
  );
  grin.rotation.set(0, Math.PI, Math.PI);
  grin.position.set(0, -0.03, -0.32);
  h.add(grin);
  a.box(h, "#fffdf0", 0, -0.045, -0.322, 0.1, 0.02, 0.005, false);
  // Messy hair tufts.
  a.ball(h, hair, 0, 0.36, 0.04, 0.35, 0.18, 0.33);
  for (const [x, y, z, r] of [
    [-0.18, 0.47, -0.12, 0.13],
    [0.05, 0.52, -0.16, 0.14],
    [0.22, 0.45, -0.08, 0.12],
    [-0.05, 0.5, 0.12, 0.15],
    [0.15, 0.42, 0.2, 0.12],
    [-0.22, 0.4, 0.16, 0.12],
  ] as const)
    a.ball(h, hair, x, y, z, r, r * 0.8, r).rotation.z = x * 2;
  // Headphones: band over the top, fat yellow cups.
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.38, 0.035, 8, 24, Math.PI),
    toon(INK),
  );
  band.position.set(0, 0.12, 0.02);
  band.rotation.y = Math.PI / 2;
  h.add(band);
  for (const s of [-1, 1]) {
    const cup = a.cyl(h, phones, s * 0.36, 0.1, 0.02, 0.13, 0.1);
    cup.rotation.z = Math.PI / 2;
    const pad = a.cyl(h, INK, s * 0.31, 0.1, 0.02, 0.11, 0.04, false);
    pad.rotation.z = Math.PI / 2;
    a.ball(h, "#ff8b69", s * 0.42, 0.1, 0.02, 0.04, 0.04, 0.04, false);
  }
  // The laptop: lid open toward them (they never look up), sticker-bombed on the back.
  const w = c.weapon;
  w.position.set(0, 0.12, -0.52);
  a.box(w, "#c8d6d0", 0, 0, 0, 0.62, 0.035, 0.42);
  const lid = new THREE.Group();
  lid.position.set(0, 0.02, -0.2);
  lid.rotation.x = -0.3;
  w.add(lid);
  a.box(lid, "#c8d6d0", 0, 0.2, 0, 0.62, 0.4, 0.03);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.34),
    new THREE.MeshBasicMaterial({ map: laptopScreen() }),
  );
  screen.position.set(0, 0.2, 0.018);
  lid.add(screen);
  // Stickers on the back of the lid, facing the street.
  const stickers: [string, number, number, number][] = [
    ["#f9db48", -0.14, 0.27, 0.07],
    ["#bd9bff", 0.13, 0.12, 0.06],
    ["#aee5a3", 0.16, 0.3, 0.045],
    ["#ff8b69", -0.12, 0.1, 0.05],
  ];
  for (const [col, x, y, r] of stickers) {
    const st = new THREE.Mesh(new THREE.CircleGeometry(r, 18), toon(col));
    st.position.set(x, y, -0.017);
    st.rotation.y = Math.PI;
    lid.add(st);
  }
  const glow = new THREE.PointLight("#9fdcff", 0.6, 1.2, 2);
  glow.position.set(0, 0.25, 0.25);
  lid.add(glow);
  c.muzzle.position.set(0, 0.3, -0.3);
}

let screenTexture: THREE.CanvasTexture | undefined;
function laptopScreen() {
  if (screenTexture) return screenTexture;
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 156;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#122d40";
  g.fillRect(0, 0, 256, 156);
  g.fillStyle = "#35556b";
  g.fillRect(0, 0, 256, 22);
  for (const [i, col] of ["#ff8b69", "#ffd96a", "#aee5a3"].entries()) {
    g.fillStyle = col;
    g.beginPath();
    g.arc(14 + i * 14, 11, 4.5, 0, 7);
    g.fill();
  }
  g.font = "bold 18px ui-monospace, Menlo, monospace";
  const lines: [string, string][] = [
    ["#bd9bff", "const"],
    ["#d6e2f0", "vibes = "],
    ["#b7e994", '"✨"'],
    ["#6889a6", "// lgtm"],
    ["#ffbc79", "ship(1)"],
  ];
  for (const [i, [col, s]] of lines.entries()) {
    g.fillStyle = col;
    g.fillText(s, 12 + (i % 2) * 30, 46 + i * 24);
  }
  g.fillStyle = "#f9db48";
  g.font = "bold 24px ui-monospace, Menlo, monospace";
  g.fillText("LGTM 🚀", 120, 140);
  screenTexture = new THREE.CanvasTexture(cv);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.userData.shared = true;
  return screenTexture;
}

/** Ease helper for callers animating a character's spot. */
export const settle = (from: number, to: number, t: number) =>
  lerp(from, to, clamp01(t));
