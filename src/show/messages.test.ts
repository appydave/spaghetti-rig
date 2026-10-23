import { describe, expect, it } from "vitest";
import { parseDirectorMessage, parsePresenterState } from "./messages";

const state = {
  type: "state",
  index: 3,
  total: 40,
  label: "Tier 1 · problem card",
  next: "Tier 1 · tool card",
  mode: "both",
  phase: "problem",
  paused: false,
  notes: {
    heading: "G00a",
    say: "Checks that only run on a laptop get skipped.",
    presenter: ["Point at the pile"],
    extra: [{ label: "Failure modes", rows: [["input", "where", "result"]] }],
  },
};

describe("parsePresenterState", () => {
  it("accepts a well-formed state message", () => {
    expect(parsePresenterState(state)).toEqual(state);
  });

  it("rejects anything that is not a state message", () => {
    expect(parsePresenterState(null)).toBeNull();
    expect(parsePresenterState("state")).toBeNull();
    expect(parsePresenterState({ type: "hello" })).toBeNull();
  });

  it("rejects a state with a missing or wrong-typed field", () => {
    for (const key of Object.keys(state)) {
      expect(parsePresenterState({ ...state, [key]: undefined })).toBeNull();
    }

    expect(parsePresenterState({ ...state, index: "3" })).toBeNull();
    expect(parsePresenterState({ ...state, paused: "no" })).toBeNull();
    expect(parsePresenterState({ ...state, mode: "solo" })).toBeNull();
  });

  it("rejects malformed notes", () => {
    const n = state.notes;
    const badNotes = [
      null,
      { ...n, heading: 1 },
      { ...n, say: undefined },
      { ...n, presenter: [1] },
      { ...n, extra: "none" },
      { ...n, extra: [null] },
      { ...n, extra: [{ rows: [] }] },
      { ...n, extra: [{ label: "x" }] },
      { ...n, extra: [{ label: "x", rows: [[1]] }] },
    ];

    for (const notes of badNotes) {
      expect(parsePresenterState({ ...state, notes })).toBeNull();
    }
  });
});

describe("parseDirectorMessage", () => {
  it("accepts hello and a command with a key", () => {
    expect(parseDirectorMessage({ type: "hello" })).toEqual({ type: "hello" });
    expect(parseDirectorMessage({ type: "cmd", key: "next" })).toEqual({
      type: "cmd",
      key: "next",
    });
  });

  it("rejects a bad message", () => {
    expect(parseDirectorMessage(null)).toBeNull();
    expect(parseDirectorMessage("hello")).toBeNull();
    expect(parseDirectorMessage({})).toBeNull();
    expect(parseDirectorMessage({ type: "state" })).toBeNull();
    expect(parseDirectorMessage({ type: "cmd" })).toBeNull();
    expect(parseDirectorMessage({ type: "cmd", key: "" })).toBeNull();
    expect(parseDirectorMessage({ type: "cmd", key: 7 })).toBeNull();
  });
});
