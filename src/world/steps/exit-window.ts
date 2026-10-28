import * as THREE from "three";
import type { CodeWindow } from "#root/src/world/code-window/codewindow.ts";
import type { StepContext } from "#root/src/world/steps/step-context.ts";
import { ease, lerp } from "#root/src/world/models/toon.ts";
import { EVENT } from "#root/src/world/palette.ts";

const EXIT_WINDOW_SECONDS = 0.7;
const EXIT_SCALE_DEBT = 0.2;
const EXIT_SCALE_MUZZLE = 0.02;
const EXIT_SPIN_DEBT = 0.3;
const EXIT_SPIN_MUZZLE = 4;
const EXIT_BURST_COUNT = 18;
const EXIT_BURST_SPEED = 3;
const DEBT_SLOT_X = -1.1;
const DEBT_SLOT_SPACING_X = 0.7;
const DEBT_SLOT_Y = 2.8;
const DEBT_SLOT_ROW_RISE = 0.5;
const DEBT_BOB_HEIGHT = 0.1;
const DEBT_SLOT_Z = 0.3;
const DEBT_DEPTH_STEPS = 3;
const DEBT_SLOT_DEPTH_SPACING = 0.35;

/** Where the i-th debt card hangs. */
export function debtSlot(c: StepContext, i: number) {
  const p = c.character.root.position;
  const t = c.timeline.clock;

  // Above and beside player 1's far shoulder: off the follow camera's lens, behind the stop window in side views.
  return new THREE.Vector3(
    DEBT_SLOT_X - (i % 2) * DEBT_SLOT_SPACING_X,
    DEBT_SLOT_Y +
      Math.floor(i / 2) * DEBT_SLOT_ROW_RISE +
      Math.sin(t * 2 + i) * DEBT_BOB_HEIGHT,
    p.z - DEBT_SLOT_Z - (i % DEBT_DEPTH_STEPS) * DEBT_SLOT_DEPTH_SPACING,
  );
}

/** The stop's window leaves: into player 1's debt pile, or out through player 2's muzzle. */
export function exitWindow(c: StepContext, w: { win: CodeWindow } | null) {
  if (!w) {
    return;
  }

  const win = w.win;
  const entry = c.timeline.track({ dispose: () => win.dispose() });
  const from = win.group.position.clone();
  const s0 = win.group.scale.x;
  const p1 = c.player === "p1";

  c.timeline.tween(
    EXIT_WINDOW_SECONDS,
    (k) => {
      const e = ease.inOutCubic(k);
      const to = p1
        ? debtSlot(c, c.street.debt.length - 1)
        : c.character.muzzleWorld();

      win.group.position.lerpVectors(from, to, e);
      win.group.scale.setScalar(
        lerp(s0, p1 ? EXIT_SCALE_DEBT : EXIT_SCALE_MUZZLE, e),
      );
      win.group.rotation.z = e * (p1 ? EXIT_SPIN_DEBT : EXIT_SPIN_MUZZLE);
    },
    () => {
      if (!p1) {
        c.fx.burst(c.character.muzzleWorld(), {
          colors: EVENT.windowExitBurst,
          n: EXIT_BURST_COUNT,
          speed: EXIT_BURST_SPEED,
        });
      }

      win.dispose();
      c.timeline.untrack(entry);
    },
  );
}
