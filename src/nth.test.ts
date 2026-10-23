import { describe, expect, it } from "vitest";
import { nth, present } from "./nth";

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

describe("present", () => {
  it("returns a value that is set, including falsy ones", () => {
    expect(present("tier 1", "the tier")).toBe("tier 1");
    expect(present(0, "the count")).toBe(0);
  });

  it("throws saying what is missing when null or undefined", () => {
    expect(() => present(null, "the boss")).toThrow("the boss is not set yet");
    expect(() => present(undefined, "the stop window")).toThrow(
      "the stop window is not set yet",
    );
  });
});
