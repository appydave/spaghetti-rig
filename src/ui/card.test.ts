import { describe, expect, it } from "vitest";
import { beforeParen, esc, shortTool } from "#root/src/ui/card.ts";

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

describe("beforeParen", () => {
  it("drops a bracketed note and keeps a plus", () => {
    expect(beforeParen("Prettier (code formatter)")).toBe("Prettier");
    expect(beforeParen("Oxlint + anti-slop")).toBe("Oxlint + anti-slop");
    expect(beforeParen("Knip (dead code\nfinder)")).toBe("Knip");
    expect(beforeParen("Vitest")).toBe("Vitest");
  });
});
