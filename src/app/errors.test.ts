// @vitest-environment happy-dom
// The error banner: a message on the page for eight seconds, for an error, an unhandled rejection or a message shown by hand.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installErrorBanner, showError } from "#root/src/app/errors.ts";

const TOAST_MS = 8000;
const banners = () =>
  [...document.querySelectorAll(".error")].map((el) => el.textContent);

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  installErrorBanner();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("showError", () => {
  it("puts the message on the page and takes it off after 8 seconds", () => {
    vi.useFakeTimers();
    showError("no good");
    expect(banners()).toEqual(["Something broke: no good"]);
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(banners()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(banners()).toEqual([]);
  });

  it("logs the cause when there is one, else the message", () => {
    const cause = new Error("root");

    showError("a", cause);
    expect(console.error).toHaveBeenLastCalledWith(cause);
    showError("b");
    expect(console.error).toHaveBeenLastCalledWith("b");
  });
});

describe("installErrorBanner", () => {
  it("an error event shows the error's message, else the event's", () => {
    dispatchEvent(new ErrorEvent("error", { error: new Error("boom") }));
    dispatchEvent(new ErrorEvent("error", { message: "plain", error: 5 }));
    expect(banners()).toEqual([
      "Something broke: boom",
      "Something broke: plain",
    ]);
  });

  it("an unhandled rejection shows the reason's message, else the reason as text", () => {
    for (const reason of [new Error("late"), "text", 42]) {
      dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason }));
    }

    expect(banners()).toEqual([
      "Something broke: late",
      "Something broke: text",
      "Something broke: 42",
    ]);
  });
});
