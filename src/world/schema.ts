import { bool, list, num, obj, oneOf, str, vec, type Vec3 } from "./model-load";

/**
 * The one generic reader for model files. A schema says what a piece of JSON must look like AND names the type it reads into, so
 * `Infer<typeof SCHEMA>` is that type: a model's type is never written by hand beside its reader, and nothing is cast.
 * Every combinator reads through the model-load helpers, so an error names the field (`gate.boom.hinge.inset must be a number`).
 */
export interface Schema<T> {
  read(v: unknown, path: string): T;
}
export type Infer<S> = S extends Schema<infer T> ? T : never;
type Shape = Record<string, Schema<unknown>>;
type Read<S extends Shape> = { [K in keyof S]: Infer<S[K]> };

export const number: Schema<number> = { read: num };
export const text: Schema<string> = { read: str };
export const flag = (fallback: boolean): Schema<boolean> => ({
  read: (v, path) => bool(v, fallback, path),
});
export const choice = <const T extends string>(
  allowed: readonly T[],
): Schema<T> => ({
  read: (v, path) => oneOf(v, allowed, path),
});
/** A position or size keyed by axis: the axes in `required` must be there, the others are 0. */
export const place = (required: readonly (keyof Vec3)[]): Schema<Vec3> => ({
  read: (v, path) => vec(v, path, required),
});
export const many = <T>(item: Schema<T>): Schema<T[]> => ({
  read: (v, path) => list(v, path).map((x, i) => item.read(x, `${path}[${i}]`)),
});

/** True when every key the shape declares came back with a value: the one place a value is trusted to have the type its schema names. */
const isRead = <S extends Shape>(
  shape: S,
  v: Record<string, unknown>,
): v is Read<S> => Object.keys(shape).every((k) => v[k] !== undefined);

export const object = <S extends Shape>(shape: S): Schema<Read<S>> => ({
  read(v, path) {
    const o = obj(v, path);
    const out = Object.fromEntries(
      Object.entries(shape).map(([k, s]) => [k, s.read(o[k], `${path}.${k}`)]),
    );

    if (!isRead(shape, out)) {
      throw new Error(`${path} is missing a field`);
    }

    return out;
  },
});
