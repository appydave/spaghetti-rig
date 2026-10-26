import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

// The robot paints its label on a canvas; a canvas that accepts any drawing call is all it needs (as in model-proof).
/** Whatever is read from it or called on it is another one of itself. */
interface Hole {
  [key: string]: Hole;
}

function makeHole(): Hole {
  return new Proxy(() => undefined, {
    get: (_t, p) => (p === Symbol.toPrimitive ? () => 8 : makeHole()),
    apply: () => makeHole(),
    set: () => true,
  }) as never;
}

vi.stubGlobal("document", {
  createElement: (tag: string) =>
    tag === "canvas"
      ? { width: 300, height: 150, getContext: () => makeHole(), style: {} }
      : {},
});

const { Enemy } = await import("./enemies");
const { ROBOT_PAUSE_SECONDS } = await import("./enemy-motion");

const PATH = 10;
const SPEED = 5;
const HALFWAY_AT = PATH / 2 / SPEED;
const FACING = new THREE.Vector3(0, 0, 1);

/** A robot on a straight 10 m path at 5 m/s: it reaches halfway at exactly 1 s, and thinks for ROBOT_PAUSE_SECONDS. */
const robot = () =>
  new Enemy(
    "robot",
    1,
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -PATH),
    SPEED,
  );

/** True while the robot's legs swing (it is walking); they hang still while it stands and thinks. */
const walking = (e: InstanceType<typeof Enemy>) =>
  e.part("leg-1").rotation.x !== 0;

describe("the robot's think pause", () => {
  it("walks right up to the halfway mark and stops to think only after it", () => {
    const e = robot();

    e.update(HALFWAY_AT, FACING);
    expect(e.age).toBe(HALFWAY_AT);
    expect(walking(e)).toBe(true);
    e.update(0.01, FACING);
    expect(walking(e)).toBe(false);
  });

  it("stands still for the whole pause, then walks on from exactly where it stopped", () => {
    const stopped = robot();
    const resumed = robot();

    for (const e of [stopped, resumed]) {
      e.update(HALFWAY_AT, FACING);
      e.update(0.5, FACING);
    }

    const stoppedAt = stopped.group.position.z;

    // 0.01 s short of the end of the pause: still standing. Exactly at the end: walking again.
    stopped.update(ROBOT_PAUSE_SECONDS - 0.5 - 0.01, FACING);
    resumed.update(ROBOT_PAUSE_SECONDS - 0.5, FACING);
    expect(resumed.age).toBe(HALFWAY_AT + ROBOT_PAUSE_SECONDS);
    expect(walking(stopped)).toBe(false);
    expect(walking(resumed)).toBe(true);
    expect(stopped.group.position.z).toBe(stoppedAt);
    expect(resumed.group.position.z).toBe(stoppedAt);
  });

  it("is not finished until it has walked the whole path, pause included", () => {
    const e = robot();

    e.update(PATH / SPEED + ROBOT_PAUSE_SECONDS - 0.01, FACING);
    expect(e.finished).toBe(false);
    e.update(0.02, FACING);
    expect(e.finished).toBe(true);
  });

  it("thinks through its states, one a second", () => {
    const e = robot();

    expect(e.thinking(0)).toBe("GENERATING…");
    expect(e.thinking(1)).toBe("THINKING…");
    expect(e.thinking(4)).toBe("GENERATING…");
  });
});
