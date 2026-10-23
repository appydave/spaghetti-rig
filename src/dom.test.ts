import { afterEach, describe, expect, it, vi } from "vitest";
import { byId, closestEl, queryAllEl, queryEl, queryElOrNull } from "./dom";

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

describe("queryEl, queryElOrNull and queryAllEl", () => {
  function stubQueries(found: FakeElement | null, all: FakeElement[] = []) {
    stubPage(null);
    vi.stubGlobal("document", {
      querySelector: () => found,
      querySelectorAll: () => all,
    });
  }

  it("queryEl returns the element the page is built to contain", () => {
    const hp = new FakeHTMLElement();
    stubQueries(hp);
    expect(queryEl(document, ".hp")).toBe(hp);
  });

  it("queryEl throws naming the selector when it is missing or not HTML", () => {
    stubQueries(null);
    expect(() => queryEl(document, ".hp")).toThrow('".hp" is not in the page');
    stubQueries(new FakeElement());
    expect(() => queryEl(document, ".hp")).toThrow('".hp" is not in the page');
  });

  it("queryElOrNull returns null instead of throwing", () => {
    stubQueries(null);
    expect(queryElOrNull(document, ".hp")).toBeNull();
  });

  it("queryAllEl keeps only HTML elements", () => {
    const a = new FakeHTMLElement();
    stubQueries(null, [a, new FakeElement()]);
    expect(queryAllEl(document, "[data-mode]")).toEqual([a]);
  });
});
