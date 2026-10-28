import type * as THREE from "three";
import type { ShotView } from "#root/src/world/camera-rig.ts";
import { lerp } from "#root/src/world/models/toon.ts";
import { followWithSun } from "#root/src/world/scene/lighting.ts";
import { debtSlot } from "#root/src/world/steps/exit-window.ts";
import type { StepContext } from "#root/src/world/steps/step-context.ts";

const READING_EASE_RATE = 6;
const READING_BOB_SPEED = 1.6;
const READING_BOB_HEIGHT = 0.004;
const DEBT_EASE_RATE = 4;
const DEBT_WOBBLE_SPEED = 3;
const DEBT_WOBBLE = 0.08;

/** What the camera needs to know of the street to frame it. */
export function shotView(c: StepContext): ShotView {
  return {
    layout: c.street.bossLayout,
    window: c.street.window?.win ?? null,
    pile: c.street.pile !== null,
  };
}

/** What the camera's position decides about the scenery. */
export function syncScenery(c: StepContext, sun: THREE.DirectionalLight) {
  // Side-on views look across the street, so the near side's buildings step out of the way.
  const right = c.street.city?.getObjectByName("city-right");
  const ahead = c.rig.mode === "follow" || c.rig.mode === "boss";

  if (right) {
    right.visible = ahead;
  }

  for (const g of c.street.gates) {
    g.near.visible = ahead;
  }

  followWithSun(sun, c.character.root.position);
}

/** Keep the stop's window in the reader's view while they read it. */
export function updateStopWindow(c: StepContext, dt: number) {
  const w = c.street.window;

  if (!w) {
    return;
  }

  if (w.reading) {
    const t = c.rig.readingPose(w.win, c.character.root.position.z);

    w.win.group.position.lerp(t.pos, 1 - Math.exp(-dt * READING_EASE_RATE));
    w.win.group.scale.setScalar(
      lerp(w.win.group.scale.x, t.scale, 1 - Math.exp(-dt * READING_EASE_RATE)),
    );
    c.rig.face(w.win.group);
    w.win.group.position.y +=
      Math.sin(c.timeline.clock * READING_BOB_SPEED) * READING_BOB_HEIGHT;
  }

  w.win.update(dt);
}

/** Player 1's trailing debt cards drift to their slots and wobble. */
export function updateDebt(c: StepContext, dt: number) {
  for (const [i, d] of c.street.debt.entries()) {
    // The result shot shows the spaghetti pile instead; the trailing cards would cover the stamp.
    d.win.group.visible = c.rig.mode !== "portrait" && c.rig.mode !== "boss";
    d.win.group.position.lerp(
      debtSlot(c, i),
      1 - Math.exp(-dt * DEBT_EASE_RATE),
    );
    c.rig.face(d.win.group);
    d.win.group.rotateZ(
      Math.sin(c.timeline.clock * DEBT_WOBBLE_SPEED + i) * DEBT_WOBBLE,
    );
    d.win.update(dt);
  }
}

/** The boss animates and keeps facing the camera. */
export function updateBoss(c: StepContext, dt: number) {
  const boss = c.street.boss;

  if (boss) {
    boss.update(dt);
    boss.group.lookAt(
      c.camera.position.x,
      boss.group.position.y,
      c.camera.position.z,
    );
  }
}
