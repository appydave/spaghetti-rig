import { describe, expect, it } from "vitest";
import { esc, shortTool } from "./card";

describe("esc", () => {
  it("escapes the five HTML characters and leaves the rest", () => {
    expect(esc(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;",
    );
    expect(esc("plain text")).toBe("plain text");
  });
});

describe("shortTool", () => {
  it("cuts a tool name at the first bracket or plus", () => {
    expect(shortTool("Prettier (code formatter)")).toBe("Prettier");
    expect(shortTool("Oxlint + anti-slop")).toBe("Oxlint");
    expect(shortTool("Knip")).toBe("Knip");
    expect(shortTool("A (b)\n+ c")).toBe("A");
  });
});
