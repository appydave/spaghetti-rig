import { describe, expect, it } from "vitest";
import { nth } from "./nth";

describe("nth", () => {
  it("returns the item at an index in range", () => {
    expect(nth(["a", "b"], 1, "letters")).toBe("b");
  });

  it("throws naming the list and index when out of range", () => {
    expect(() => nth(["a"], 3, "letters")).toThrow(
      "letters[3] is out of range (1 items)",
    );
    expect(() => nth([], -1, "letters")).toThrow("letters[-1]");
  });
});
