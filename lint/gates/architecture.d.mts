// Types for architecture.mjs, so the test can import it without a suppression.
export type Finding = {
  type: string;
  rule: string;
  file: string;
  metrics: Record<string, number>;
};

export const REPO: string;
export const CONFIG: string;
export const RULES: Record<string, { rule: string; hint: string }>;
export function detectors(): string[];
export function scan(srcDir?: string): Finding[];
export function describe(finding: Finding): string;
