// Types for check-folder-size.mjs, so the gate test can import it without a suppression.
export const MAX_FILES: number;
export const MAX_FOLDERS: number;
export const ROOTS: string[];
export function folderFindings(paths: readonly string[]): string[];
