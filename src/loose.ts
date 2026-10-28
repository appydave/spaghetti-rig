// The guards both JSON loaders (the soundtrack, the game content) read untyped data with: each returns the value or a fallback, never throws.

export type Loose = Record<string, unknown>;

export const isObj = (v: unknown): v is Loose =>
  typeof v === "object" && v !== null && !Array.isArray(v);
export const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
export const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
export const optStr = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;
