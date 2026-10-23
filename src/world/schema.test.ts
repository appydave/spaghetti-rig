import { describe, expect, it } from "vitest";
import { choice, flag, many, number, object, place, text } from "./schema";

const bad = (read: () => void, message: RegExp) =>
  expect(read).toThrow(message);

describe("schema combinators", () => {
  it("reads a number and a piece of text, and names the field when it is neither", () => {
    expect(number.read(3, "x")).toBe(3);
    expect(text.read("a", "x")).toBe("a");
    bad(() => number.read("3", "gate.x"), /gate.x must be a number/);
    bad(() => text.read(3, "gate.x"), /gate.x must be text/);
  });

  it("reads a flag, with its fallback when left out", () => {
    expect(flag(true).read(undefined, "x")).toBe(true);
    expect(flag(false).read(undefined, "x")).toBe(false);
    expect(flag(true).read(false, "x")).toBe(false);
    bad(() => flag(true).read("no", "x"), /x must be true or false/);
  });

  it("reads one of a fixed set of names", () => {
    expect(choice(["a", "b"]).read("b", "x")).toBe("b");
    bad(() => choice(["a", "b"]).read("c", "x"), /x must be one of a, b/);
  });

  it("reads a place: the axes asked for must be there, the others are 0", () => {
    expect(place(["y"]).read({ y: 2 }, "x")).toEqual({ x: 0, y: 2, z: 0 });
    bad(() => place(["y", "z"]).read({ y: 2 }, "p"), /p.z must be a number/);
  });

  it("reads a list of anything, and names the item that is wrong", () => {
    expect(many(number).read([1, 2], "x")).toEqual([1, 2]);
    bad(() => many(number).read({}, "x"), /x must be a list/);
    bad(() => many(number).read([1, "a"], "x"), /x\[1\] must be a number/);
  });
});

describe("schema object", () => {
  const shape = object({ n: number, inner: object({ t: text }) });

  it("reads every declared field, ignoring extras", () => {
    expect(shape.read({ n: 1, inner: { t: "a" }, extra: 9 }, "g")).toEqual({
      n: 1,
      inner: { t: "a" },
    });
  });

  it("names the path of a bad or missing field, and refuses a non-object", () => {
    bad(
      () => shape.read({ n: 1, inner: { t: 2 } }, "g"),
      /g.inner.t must be text/,
    );
    bad(() => shape.read({ inner: { t: "a" } }, "g"), /g.n must be a number/);
    bad(() => shape.read([], "g"), /g must be an object/);
  });

  it.each(["a", "b", "c"])(
    "refuses a field whose schema produced nothing, wherever it sits (%s)",
    (empty) => {
      const nothing = { read: () => undefined };
      const shape = object({
        a: empty === "a" ? nothing : number,
        b: empty === "b" ? nothing : number,
        c: empty === "c" ? nothing : number,
      });

      bad(
        () => shape.read({ a: 1, b: 2, c: 3 }, "g"),
        new RegExp(`^g\\.${empty} is missing$`),
      );
    },
  );
});
