// One test of a proof harness plays a whole tier (or builds every model), which is real work: 3.4 s at worst on a quiet machine and 22.7 s with
// 16 busy processes sharing it, against Vitest's default 5 s that failed 16 tests then. Each *-proof.test.ts raises its own file's limit to this.
export const PROOF_TEST_TIMEOUT_MS = 90_000;
