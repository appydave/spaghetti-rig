import type { PresenterState } from "./director";
import { MODES, type Notes } from "./script";

/** What the presenter window sends the game window. */
export type DirectorMessage = { type: "hello" } | { type: "cmd"; key: string };

const isObject = (v: unknown): v is object =>
  typeof v === "object" && v !== null;
const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number => typeof v === "number";
const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => isString(x));
const isRows = (v: unknown): v is string[][] =>
  Array.isArray(v) && v.every((x) => isStrings(x));

/** The fields of a message body: its own entries, read once. */
type Fields = [string, unknown][];

/** The field `key` among `fields` if it is there and `is` accepts it; undefined if it is missing or the wrong kind. */
function read<T>(
  fields: Fields,
  key: string,
  is: (v: unknown) => v is T,
): T | undefined {
  const v: unknown = fields.find(([k]) => k === key)?.[1];

  return is(v) ? v : undefined;
}

function parseExtra(e: unknown): Notes["extra"][number] | null {
  if (!isObject(e)) {
    return null;
  }

  const fields = Object.entries(e);
  const label = read(fields, "label", isString);
  const rows = read(fields, "rows", isRows);

  return label === undefined || !rows ? null : { label, rows };
}

function parseNotes(v: unknown): Notes | null {
  if (!isObject(v)) {
    return null;
  }

  const fields = Object.entries(v);
  const heading = read(fields, "heading", isString);
  const say = read(fields, "say", isString);
  const presenter = read(fields, "presenter", isStrings);
  const raw = read(fields, "extra", Array.isArray);

  if (heading === undefined || say === undefined || !presenter || !raw) {
    return null;
  }

  const extra: Notes["extra"] = [];

  for (const e of raw) {
    const item = parseExtra(e);

    if (!item) {
      return null;
    }

    extra.push(item);
  }

  return { heading, say, presenter, extra };
}

/** Where the show is: the step number, how many there are, and whether it is paused. */
function readPosition(fields: Fields) {
  const index = read(fields, "index", isNumber);
  const total = read(fields, "total", isNumber);
  const paused = read(fields, "paused", isBoolean);

  return index === undefined || total === undefined || paused === undefined
    ? null
    : { index, total, paused };
}

/** What the step is called: its label, the label of the next step, and its phase. */
function readLabels(fields: Fields) {
  const label = read(fields, "label", isString);
  const next = read(fields, "next", isString);
  const phase = read(fields, "phase", isString);

  return label === undefined || next === undefined || phase === undefined
    ? null
    : { label, next, phase };
}

/** The game window's state as the presenter window receives it, or null if the message is not one. */
export function parsePresenterState(data: unknown): PresenterState | null {
  if (!isObject(data)) {
    return null;
  }

  const fields = Object.entries(data);

  if (read(fields, "type", isString) !== "state") {
    return null;
  }

  if (!("notes" in data) || !("mode" in data)) {
    return null;
  }

  const position = readPosition(fields);
  const labels = readLabels(fields);
  const mode = MODES.find((m) => m.mode === data.mode);
  const notes = parseNotes(data.notes);

  if (!position || !labels || !mode || !notes) {
    return null;
  }

  return {
    type: "state",
    index: position.index,
    total: position.total,
    label: labels.label,
    next: labels.next,
    mode: mode.mode,
    notes,
    phase: labels.phase,
    paused: position.paused,
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
