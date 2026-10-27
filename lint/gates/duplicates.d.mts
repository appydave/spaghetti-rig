// Types for duplicates.mjs, so the test can import it without a suppression.
type Profile = "exact" | "similar";
type Scan = "production" | "tests";

export const REPO: string;
export const PROFILES: Record<Profile, string[]>;
export const TEST_PROFILES: Record<Profile, string[]>;
export const SCANS: Record<
  Scan,
  { config: string; profiles: Record<Profile, string[]> }
>;
export function runProfile(
  name: Profile,
  cwd?: string,
  scan?: Scan,
): { code: number; output: string };
