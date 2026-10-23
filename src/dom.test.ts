import { afterEach, describe, expect, it, vi } from "vitest";
import { byId, closestEl } from "./dom";

// Node has no DOM, so these stand in for the browser's classes while a test runs.
class FakeElement extends EventTarget {
  constructor(private readonly match: FakeElement | null = null) {
    super();
  }
  closest() {
    return this.match;
  }
}
class FakeHTMLElement extends FakeElement {}
class FakeCanvas extends FakeHTMLElement {}

function stubPage(found: FakeElement | null) {
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("HTMLElement", FakeHTMLElement);
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("document", { getElementById: () => found });
}

afterEach(() => vi.unstubAllGlobals());

describe("byId", () => {
  it("returns the element when it has the asked-for type", () => {
    const canvas = new FakeCanvas();
    stubPage(canvas);
    expect(byId("stage", HTMLCanvasElement)).toBe(canvas);
  });

  it("throws a clear message when the id is not in the page", () => {
    stubPage(null);
    expect(() => byId("stage", HTMLElement)).toThrow(
      "#stage is not in the page",
    );
  });

  it("throws a clear message when the element is the wrong type", () => {
    stubPage(new FakeHTMLElement());
    expect(() => byId("stage", HTMLCanvasElement)).toThrow(
      "#stage is not a FakeCanvas",
    );
  });
});

describe("closestEl", () => {
  it("returns the matching ancestor", () => {
    stubPage(null);
    const hit = new FakeHTMLElement();
    expect(closestEl(new FakeElement(hit), ".x")).toBe(hit);
  });

  it("returns null for a target that is not an element", () => {
    stubPage(null);
    expect(closestEl(null, ".x")).toBeNull();
    expect(closestEl(new EventTarget(), ".x")).toBeNull();
  });

  it("returns null when the match is not an HTML element", () => {
    stubPage(null);
    expect(closestEl(new FakeElement(new FakeElement()), ".x")).toBeNull();
  });
});
