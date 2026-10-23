import type { PresenterState } from "./director";
import { MODES, type Notes } from "./script";

/** What the presenter window sends the game window. */
export type DirectorMessage = { type: "hello" } | { type: "cmd"; key: string };

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

function parseNotes(v: unknown): Notes | null {
  if (typeof v !== "object" || v === null) {
    return null;
  }

  if (!("heading" in v) || typeof v.heading !== "string") {
    return null;
  }

  if (!("say" in v) || typeof v.say !== "string") {
    return null;
  }

  if (!("presenter" in v) || !isStrings(v.presenter)) {
    return null;
  }

  if (!("extra" in v) || !Array.isArray(v.extra)) {
    return null;
  }

  const extra: Notes["extra"] = [];

  for (const e of v.extra) {
    if (typeof e !== "object" || e === null) {
      return null;
    }

    if (!("label" in e) || typeof e.label !== "string") {
      return null;
    }

    if (!("rows" in e) || !Array.isArray(e.rows)) {
      return null;
    }

    if (!e.rows.every(isStrings)) {
      return null;
    }

    extra.push({ label: e.label, rows: e.rows });
  }

  return { heading: v.heading, say: v.say, presenter: v.presenter, extra };
}

/** The game window's state as the presenter window receives it, or null if the message is not one. */
export function parsePresenterState(data: unknown): PresenterState | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  if (!("type" in data) || data.type !== "state") {
    return null;
  }

  if (!("index" in data) || typeof data.index !== "number") {
    return null;
  }

  if (!("total" in data) || typeof data.total !== "number") {
    return null;
  }

  if (!("label" in data) || typeof data.label !== "string") {
    return null;
  }

  if (!("next" in data) || typeof data.next !== "string") {
    return null;
  }

  if (!("phase" in data) || typeof data.phase !== "string") {
    return null;
  }

  if (!("paused" in data) || typeof data.paused !== "boolean") {
    return null;
  }

  if (!("notes" in data) || !("mode" in data)) {
    return null;
  }

  const mode = MODES.find((m) => m.mode === data.mode);
  const notes = parseNotes(data.notes);

  if (!mode || !notes) {
    return null;
  }

  return {
    type: "state",
    index: data.index,
    total: data.total,
    label: data.label,
    next: data.next,
    mode: mode.mode,
    notes,
    phase: data.phase,
    paused: data.paused,
  };
}

/** A message from the presenter window as the game window receives it, or null if it is not one. */
export function parseDirectorMessage(data: unknown): DirectorMessage | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  if (!("type" in data)) {
    return null;
  }

  if (data.type === "hello") {
    return { type: "hello" };
  }

  if (data.type !== "cmd") {
    return null;
  }

  if (!("key" in data) || typeof data.key !== "string" || !data.key) {
    return null;
  }

  return { type: "cmd", key: data.key };
}
