// Types for name-audit.mjs, so the test can import it without a suppression.
export interface Constant {
  name: string;
  file: string;
  line: number;
  init: string;
  value: number;
  exported: boolean;
  refs: number;
}

export interface NameAudit {
  constants: number;
  positional: Constant[];
  echoes: Constant[];
  duplicates: { name: string; files: string[]; values: string[] }[];
  halves: Constant[];
  singleUse: Record<string, number>;
  singleUseTotal: number;
}

export function assetDataFiles(root?: string): string[];
export function auditNames(root?: string, assets?: string[]): NameAudit;
export function readFile(
  text: string,
  file: string,
): { decls: Constant[]; uses: Map<string, number> };
