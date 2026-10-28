/** Shared by the model loaders: loose JSON in, typed values out, and an error that names the field when something is wrong. */

type Loose = Record<string, unknown>;
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
type Axis = keyof Vec3;

const isObj = (v: unknown): v is Loose =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function obj(v: unknown, path: string): Loose {
  if (!isObj(v)) {
    throw new Error(`${path} must be an object`);
  }

  return v;
}

export function list(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) {
    throw new TypeError(`${path} must be a list`);
  }

  return v;
}

export function num(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new TypeError(`${path} must be a number`);
  }

  return v;
}

export function str(v: unknown, path: string): string {
  if (typeof v !== "string") {
    throw new TypeError(`${path} must be text`);
  }

  return v;
}

/** A number that may be left out. */
export const numOr = (v: unknown, fallback: number, path: string): number =>
  v === undefined ? fallback : num(v, path);

/** A flag that may be left out. */
export function bool(v: unknown, fallback: boolean, path: string): boolean {
  if (v === undefined) {
    return fallback;
  }

  if (typeof v !== "boolean") {
    throw new TypeError(`${path} must be true or false`);
  }

  return v;
}

export function oneOf<T extends string>(
  v: unknown,
  allowed: readonly T[],
  path: string,
): T {
  const found = allowed.find((a) => a === v);

  if (found === undefined) {
    throw new Error(`${path} must be one of ${allowed.join(", ")}`);
  }

  return found;
}

/** A position or size keyed by axis: the axes in `required` must be there, the others are 0 when left out. */
export function vec(v: unknown, path: string, required: readonly Axis[]): Vec3 {
  const o = obj(v, path);
  const axis = (a: Axis) =>
    required.includes(a)
      ? num(o[a], `${path}.${a}`)
      : numOr(o[a], 0, `${path}.${a}`);

  return { x: axis("x"), y: axis("y"), z: axis("z") };
}
