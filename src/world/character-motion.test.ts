import { describe, expect, it, vi } from "vitest";
import { canvasDocument } from "../../lint/gates/recording-canvas";

// The characters paint their faces on a canvas; a canvas that accepts any drawing call is all they need (the stand-in the proof harnesses use).
vi.stubGlobal("document", canvasDocument());

const { Character } = await import("./characters");

const FRAME = 1 / 60;
/** Long enough for the fall (about half a second) to finish. */
const SETTLED_FRAMES = 120;
const FALLEN_TILT = Math.PI / 2 - 0.06;
const FALLEN_HEIGHT = 0.28;

function play(c: InstanceType<typeof Character>, frames: number) {
  for (let i = 0; i < frames; i++) {
    c.update(FRAME);
  }
}

describe("a character that is down", () => {
  it("falls onto their back and lies there, exactly at rest", () => {
    const c = new Character("p1");

    c.pose = "down";
    play(c, SETTLED_FRAMES);
    expect(c.root.rotation.x).toBe(FALLEN_TILT);
    expect(c.root.position.y).toBe(FALLEN_HEIGHT);
    play(c, SETTLED_FRAMES);
    expect(c.root.rotation.x).toBe(FALLEN_TILT);
    expect(c.root.position.y).toBe(FALLEN_HEIGHT);
  });

  it("is part way down mid-fall, and bounces a little as they land", () => {
    const c = new Character("p1");

    c.pose = "down";
    play(c, 10);
    expect(c.root.rotation.x).toBeGreaterThan(0);
    expect(c.root.rotation.x).toBeLessThan(FALLEN_TILT);
    expect(c.root.position.y).toBeGreaterThan(0);
  });

  it("gets back up when the pose changes", () => {
    const c = new Character("p1");

    c.pose = "down";
    play(c, SETTLED_FRAMES);
    c.pose = "idle";
    play(c, SETTLED_FRAMES);
    expect(c.root.rotation.x).toBe(0);
    expect(c.root.position.y).toBe(0);
  });
});

describe("a character's kicks", () => {
  it("kicks back when they fire, and settles", () => {
    const c = new Character("p2");

    c.update(FRAME);

    const rest = c.weapon.position.z;

    c.fire();
    c.update(FRAME);
    expect(c.weapon.position.z).toBeGreaterThan(rest);
    play(c, SETTLED_FRAMES);
    expect(c.weapon.position.z).toBe(rest);
  });

  it("flinches when they are hit, and settles back to where an unhurt twin is", () => {
    const hurt = new Character("p2");
    const twin = new Character("p2");

    hurt.update(FRAME);
    twin.update(FRAME);
    hurt.hit();
    hurt.update(FRAME);
    twin.update(FRAME);
    expect(hurt.head.rotation.x).toBeLessThan(twin.head.rotation.x);
    play(hurt, SETTLED_FRAMES);
    play(twin, SETTLED_FRAMES);
    expect(hurt.head.rotation.x).toBe(twin.head.rotation.x);
    expect(hurt.upper.rotation.y).toBe(twin.upper.rotation.y);
  });
});
