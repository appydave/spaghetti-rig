import * as THREE from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { canvasDocument } from "#root/lint/gates/recording-canvas.ts";

// The showcases only paint label textures on a canvas; a canvas that accepts any drawing call is all they need (the stand-in the proof harnesses use).
vi.stubGlobal("document", canvasDocument());

const { TitleShowcase, VsShowcase } =
  await import("#root/src/world/models/showcase.ts");

const FACE_OFF_X = 2.1;
const SLIDE_IN_DISTANCE = 6;
const SLIDE_IN_SECONDS = 0.45;
const AIM_AFTER_SECONDS = 0.6;
const FRAME = 1 / 60;
/** Decimal places the sway is checked to: tighter than a 10% change in its size. */
const PRECISION = 6;

describe("VsShowcase aspect", () => {
  it("pulls the camera back on a narrow screen and keeps it close on a wide one", () => {
    const vs = new VsShowcase();

    vs.setAspect(1);
    expect(vs.camera.aspect).toBe(1);
    expect(vs.camera.position.z).toBe(16);
    vs.setAspect(16 / 9);
    expect(vs.camera.aspect).toBe(16 / 9);
    expect(vs.camera.position.z).toBe(13);
  });

  it("switches to the close camera at an aspect of 1.4 exactly", () => {
    const vs = new VsShowcase();

    vs.setAspect(1.39);
    expect(vs.camera.position.z).toBe(16);
    vs.setAspect(1.4);
    expect(vs.camera.position.z).toBe(13);
  });
});

describe("VsShowcase face-off", () => {
  it("starts the two developers far out at each side and slides them in to their marks", () => {
    const vs = new VsShowcase();

    vs.update(0);
    expect(vs.p1.root.position.x).toBeCloseTo(-FACE_OFF_X - SLIDE_IN_DISTANCE);
    expect(vs.p2.root.position.x).toBeCloseTo(FACE_OFF_X + SLIDE_IN_DISTANCE);
    vs.update(SLIDE_IN_SECONDS);
    expect(vs.p1.root.position.x).toBeCloseTo(-FACE_OFF_X);
    expect(vs.p2.root.position.x).toBeCloseTo(FACE_OFF_X);
  });

  it("eases out: halfway through the slide they are more than halfway in", () => {
    const vs = new VsShowcase();

    vs.update(SLIDE_IN_SECONDS / 2);
    expect(vs.p2.root.position.x).toBeLessThan(
      FACE_OFF_X + SLIDE_IN_DISTANCE / 2,
    );
  });

  it("walks in, then squares up and aims at each other", () => {
    const vs = new VsShowcase();

    vs.update(0);
    expect([vs.p1.pose, vs.p2.pose]).toEqual(["walk", "walk"]);
    vs.update(AIM_AFTER_SECONDS);
    expect([vs.p1.pose, vs.p2.pose]).toEqual(["walk", "walk"]);
    vs.update(FRAME);
    expect([vs.p1.pose, vs.p2.pose]).toEqual(["aim", "aim"]);
  });

  it("keeps each shadow under its developer, and shows both after a solo intro", () => {
    const vs = new VsShowcase();

    vs.solo = "p1";
    vs.update(1);
    vs.solo = null;
    vs.update(FRAME);

    for (const c of [vs.p1, vs.p2]) {
      const shadow = c.root.userData.shadow as THREE.Object3D;

      expect(c.root.visible).toBe(true);
      expect(shadow.visible).toBe(true);
      expect(shadow.position.x).toBe(c.root.position.x);
      expect(c.root.scale.x).toBeCloseTo(1.45);
    }
  });

  it("restarts the slide-in when reset", () => {
    const vs = new VsShowcase();

    vs.update(1);
    expect(vs.p2.root.position.x).toBeCloseTo(FACE_OFF_X);
    vs.reset();
    vs.update(0);
    expect(vs.p2.root.position.x).toBeCloseTo(FACE_OFF_X + SLIDE_IN_DISTANCE);
  });
});

describe("VsShowcase solo intro", () => {
  it.each([
    ["p1", "p2"],
    ["p2", "p1"],
  ] as const)(
    "shows only %s, big and on the right, and hides %s",
    (solo, other) => {
      const vs = new VsShowcase();

      vs.solo = solo;
      vs.update(1);

      const me = vs[solo];
      const them = vs[other];

      expect(me.root.visible).toBe(true);
      expect(them.root.visible).toBe(false);
      expect((them.root.userData.shadow as THREE.Object3D).visible).toBe(false);
      expect(me.root.scale.x).toBeCloseTo(1.75);
      expect(me.root.position.x).toBeCloseTo(2.6);
      expect((me.root.userData.shadow as THREE.Object3D).position.x).toBe(
        me.root.position.x,
      );
    },
  );

  it("slides the solo developer in from further right, and aims once settled", () => {
    const vs = new VsShowcase();

    vs.solo = "p2";
    vs.update(0);
    expect(vs.p2.root.position.x).toBeCloseTo(2.6 + 7);
    expect(vs.p2.pose).toBe("walk");
    vs.update(AIM_AFTER_SECONDS);
    expect(vs.p2.pose).toBe("walk");
    vs.update(FRAME);
    expect(vs.p2.pose).toBe("aim");
  });
});

/** The hanging code windows of the title screen: every object that remembers a home position. */
const windowsOf = (scene: THREE.Scene) => {
  const found: THREE.Object3D[] = [];

  scene.traverse((o) => {
    if (o.userData.home instanceof THREE.Vector3) {
      found.push(o);
    }
  });

  return found;
};

describe("TitleShowcase", () => {
  let title: InstanceType<typeof TitleShowcase>;

  beforeAll(() => {
    title = new TitleShowcase();
  });

  it("slides the hero to the right of whatever the aspect is, with a view offset of 22% of the width", () => {
    title.setAspect(2);
    expect(title.camera.aspect).toBe(2);
    expect(title.camera.view).toMatchObject({
      enabled: true,
      fullWidth: 2000,
      fullHeight: 1000,
      offsetX: -440,
      offsetY: 0,
      width: 2000,
      height: 1000,
    });
  });

  it("rebuilds the projection for the new aspect and offset", () => {
    title.setAspect(2);

    const same = new THREE.PerspectiveCamera(32, 2, 0.1, 100);

    same.setViewOffset(2000, 1000, -440, 0, 2000, 1000);
    same.updateProjectionMatrix();
    expect(title.camera.projectionMatrix.elements).toEqual(
      same.projectionMatrix.elements,
    );
  });

  it("floats each code window on a gentle sway around its home", () => {
    const [first] = windowsOf(title.scene);
    const home = first?.userData.home as THREE.Vector3;
    const dt = 0.5;

    title.update(dt);
    expect(first?.position.x).toBeCloseTo(
      home.x + Math.sin(dt * 0.7) * 0.12,
      PRECISION,
    );
    expect(first?.position.y).toBeCloseTo(
      home.y + Math.sin(dt * 1.1) * 0.18,
      PRECISION,
    );
    expect(first?.position.z).toBe(home.z);
    expect(first?.rotation.y).toBeCloseTo(
      0.35 + Math.sin(dt * 0.5) * 0.08,
      PRECISION,
    );
  });

  it("spins the lightning bolt", () => {
    const spinners: THREE.Object3D[] = [];

    title.scene.traverse((o) => {
      if (o.userData.spin) {
        spinners.push(o);
      }
    });

    const before = spinners.map((o) => o.rotation.y);

    title.update(0.2);
    spinners.forEach((o, i) => {
      expect(o.rotation.y - (before[i] ?? 0)).toBeCloseTo(0.2 * 1.5);
    });
    expect(spinners.length).toBeGreaterThan(0);
  });
});
