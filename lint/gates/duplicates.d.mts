// Types for duplicates.mjs, so the test can import it without a suppression.
export const REPO: string;
export const PROFILES: Record<"exact" | "similar", string[]>;
export function runProfile(
  name: "exact" | "similar",
  cwd?: string,
): { code: number; output: string };
