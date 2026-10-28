import { nth, present } from "#root/src/nth.ts";
import type { Step } from "#root/src/show/script.ts";
import type { StepContext } from "#root/src/world/steps/step-context.ts";
import type { State } from "#root/src/world/world-shared.ts";

/** Make the world match a state, reusing whatever already matches. */
export function matchState(c: StepContext, s: State) {
  c.timeline.clear();

  const tier = nth(c.game.tiers, s.tier, "tiers");

  if (c.street.tier !== tier) {
    c.street.clear();
    c.combat.clear();
    c.debris.clear();
    c.fx.clear();
    c.street.build(tier);
  }

  c.character.root.position.set(0, 0, s.z);
  c.character.root.rotation.y = 0;
  c.character.pose = s.pose;
  c.street.sync(s, tier);
  c.setHealth(s.health);
  c.rig.mode = s.camera;
}

/** The window changed shape: keep the boss behind the player and, if a step is showing, re-lay the stop window. */
export function applyAspect(
  c: StepContext,
  aspect: number,
  state: State | null,
  step: Step | null,
) {
  const changed = c.rig.setAspect(aspect);

  if (c.street.boss && state) {
    c.street.boss.group.position.z =
      state.z - c.rig.bossBack(present(c.street.bossLayout, "boss layout"));
  }

  // Re-lay the stop window for the new shape.
  if (changed && state && step) {
    const keep = c.health();

    c.reconcile(state);
    c.setHealth(keep);
  }
}
