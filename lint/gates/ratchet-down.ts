// The coverage ratchet can only go down. vite.config.ts caps how many statements, branches and functions may stay uncovered (the
// MAX_UNCOVERED_* constants); a cap raised in the same diff that adds untested code would let that code in. This reads the three caps out of
// two copies of vite.config.ts, the base (origin/main) and the change, and names every cap that is missing or higher than on the base.
const CAP_NAMES = [
  "MAX_UNCOVERED_STATEMENTS",
  "MAX_UNCOVERED_BRANCHES",
  "MAX_UNCOVERED_FUNCTIONS",
];
const ASSIGNMENT = /^const (MAX_UNCOVERED_[A-Z]+) = (\d+);$/gm;

/** Every MAX_UNCOVERED_* constant a vite.config.ts source assigns, by name. */
function uncoveredCaps(source: string) {
  const caps = new Map<string, number>();

  for (const [, name, value] of source.matchAll(ASSIGNMENT)) {
    if (name && value) {
      caps.set(name, Number(value));
    }
  }

  return caps;
}

/** What is wrong with `head` against `base`: a cap that is gone, or one that rose. Empty when every cap is the same or lower. */
export function capProblems(base: string, head: string) {
  const before = uncoveredCaps(base);
  const after = uncoveredCaps(head);

  return CAP_NAMES.flatMap((name) => {
    const was = before.get(name);
    const now = after.get(name);

    if (now === undefined) {
      return [`${name} is missing from vite.config.ts`];
    }

    return was !== undefined && now > was
      ? [
          `${name} rose from ${was} to ${now}: lower uncovered counts only; raising one needs a human ruling`,
        ]
      : [];
  });
}
