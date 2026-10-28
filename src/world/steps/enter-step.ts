import type { Step } from "#root/src/show/script.ts";
import { enterBoss } from "#root/src/world/steps/boss-arrive-step.ts";
import { enterBossDown } from "#root/src/world/steps/boss-down-step.ts";
import { enterBossPart } from "#root/src/world/steps/boss-part-step.ts";
import { exitWindow } from "#root/src/world/steps/exit-window.ts";
import { enterFixed } from "#root/src/world/steps/fixed-step.ts";
import { enterProblem } from "#root/src/world/steps/problem-step.ts";
import type { StepContext } from "#root/src/world/steps/step-context.ts";
import { startWalk, type Walk } from "#root/src/world/walk.ts";
import { stateFor } from "#root/src/world/world-state.ts";

/** Play a step forward from the previous one. Returns the walk when the step starts one. */
export function enterStep(c: StepContext, step: Step): Walk | null {
  const keepWin =
    c.street.window !== null &&
    (step.phase === "walk" || step.phase === "boss");
  // A window that is leaving is kept alive for its exit animation.
  const prevWindow = keepWin ? c.street.releaseWindow() : null;
  const s = stateFor(c.game, c.player, step);

  switch (step.phase) {
    case "walk":
      c.reconcile(s);
      exitWindow(c, prevWindow);

      return startWalk(c, step);
    case "problem":
      enterProblem(c, step, s);
      break;
    case "fixed":
      enterFixed(c, step, s);
      break;
    case "boss":
      c.reconcile(s);
      if (keepWin) {
        exitWindow(c, prevWindow);
      }

      enterBoss(c);
      break;
    case "bossPart":
      enterBossPart(c, step, s);
      break;
    case "bossDown":
      enterBossDown(c, s);
      break;
    case "tool":
      c.reconcile(s);
      if (c.player === "p2") {
        c.character.fire();
      }

      break;
    default:
      c.reconcile(s);
  }

  return null;
}
