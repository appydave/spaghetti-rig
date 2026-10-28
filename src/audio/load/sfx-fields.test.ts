import { describe, expect, it } from "vitest";
import {
  bool,
  list,
  num,
  numOr,
  obj,
  oneOf,
  str,
  vec,
} from "#root/src/audio/load/sfx-fields.ts";

describe("the model loader helpers", () => {
  it("hand back a value of the right kind unchanged", () => {
    const o = { a: 1 };
    const l = [1, 2];

    expect(obj(o, "m")).toBe(o);
    expect(list(l, "m")).toBe(l);
    expect(num(2.5, "m")).toBe(2.5);
    expect(str("text", "m")).toBe("text");
    expect(bool(false, true, "m")).toBe(false);
    expect(oneOf("b", ["a", "b"] as const, "m")).toBe("b");
  });

  it("name the field when the value is the wrong kind", () => {
    expect(() => obj([], "m.o")).toThrow("m.o must be an object");
    expect(() => obj(null, "m.o")).toThrow("m.o must be an object");
    expect(() => list({}, "m.l")).toThrow("m.l must be a list");
    expect(() => num("3", "m.n")).toThrow("m.n must be a number");
    expect(() => num(Number.NaN, "m.n")).toThrow("m.n must be a number");
    expect(() => num(Infinity, "m.n")).toThrow("m.n must be a number");
    expect(() => str(3, "m.s")).toThrow("m.s must be text");
    expect(() => bool("yes", true, "m.b")).toThrow("m.b must be true or false");
    expect(() => oneOf("c", ["a", "b"] as const, "m.k")).toThrow(
      "m.k must be one of a, b",
    );
  });

  it("use the fallback only when a value is left out", () => {
    expect(numOr(undefined, 7, "m")).toBe(7);
    expect(numOr(0, 7, "m")).toBe(0);
    expect(() => numOr("0", 7, "m.n")).toThrow("m.n must be a number");
    expect(bool(undefined, true, "m")).toBe(true);
  });

  it("read a position or size keyed by axis, requiring only the axes asked for", () => {
    expect(vec({ x: 1, y: 2, z: 3 }, "m", ["x", "y", "z"])).toEqual({
      x: 1,
      y: 2,
      z: 3,
    });
    expect(vec({ y: 2 }, "m", ["y"])).toEqual({ x: 0, y: 2, z: 0 });
    expect(() => vec({ x: 1 }, "m.at", ["y"])).toThrow(
      "m.at.y must be a number",
    );
    expect(() => vec({ y: 1, x: "far" }, "m.at", ["y"])).toThrow(
      "m.at.x must be a number",
    );
    expect(() => vec("here", "m.at", ["y"])).toThrow("m.at must be an object");
  });
});
