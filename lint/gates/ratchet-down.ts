// The coverage ratchet can only go down. vite.config.ts caps how many statements, branches and functions may stay uncovered (the
// MAX_UNCOVERED_* constants) and keeps a percentage backstop (the BACKSTOP_* constants); a cap raised, or a backstop lowered, in the same diff
// that adds untested code would let that code in. This reads those constants out of two copies of vite.config.ts, the base (origin/main) and the
// change, and names every one that is missing or moved the wrong way. It also pins the `thresholds` lines that use the constants, because a cap
// written inline there (`-(MAX_UNCOVERED_STATEMENTS + 50)`) would raise the real limit without touching a constant.
const CAP_NAMES = [
  "MAX_UNCOVERED_STATEMENTS",
  "MAX_UNCOVERED_BRANCHES",
  "MAX_UNCOVERED_FUNCTIONS",
];
const BACKSTOP_NAMES = [
  "BACKSTOP_STATEMENTS",
  "BACKSTOP_BRANCHES",
  "BACKSTOP_FUNCTIONS",
];
/** The thresholds lines, verbatim: the three caps, then the three backstop percentages. */
const PINNED_LINES = [
  "statements: -MAX_UNCOVERED_STATEMENTS,",
  "branches: -MAX_UNCOVERED_BRANCHES,",
  "functions: -MAX_UNCOVERED_FUNCTIONS,",
  "statements: BACKSTOP_STATEMENTS,",
  "branches: BACKSTOP_BRANCHES,",
  "functions: BACKSTOP_FUNCTIONS,",
];
const ASSIGNMENT =
  /^const ((?:MAX_UNCOVERED|BACKSTOP)_[A-Z]+) = (\d+(?:\.\d+)?);$/gm;
/** A key of the thresholds object: each of statements, branches and functions appears twice (the cap and the backstop), no more. */
const THRESHOLD_KEY = /^\s+(?:statements|branches|functions):/gm;

/** Every MAX_UNCOVERED_* and BACKSTOP_* constant a vite.config.ts source assigns, by name. */
function ratchetValues(source: string) {
  const values = new Map<string, number>();

  for (const [, name, value] of source.matchAll(ASSIGNMENT)) {
    if (name && value) {
      values.set(name, Number(value));
    }
  }

  return values;
}

/** What is wrong with `head` against `base`: a constant that is gone, a cap that rose, a backstop that fell, or thresholds that are not the pinned lines. */
export function capProblems(base: string, head: string) {
  const before = ratchetValues(base);
  const after = ratchetValues(head);
  const moves = [...CAP_NAMES, ...BACKSTOP_NAMES].flatMap((name) => {
    const was = before.get(name);
    const now = after.get(name);

    if (now === undefined) {
      return [`${name} is missing from vite.config.ts`];
    }

    if (was === undefined) {
      return [];
    }

    if (CAP_NAMES.includes(name) && now > was) {
      return [
        `${name} rose from ${was} to ${now}: lower uncovered counts only; raising one needs a human ruling`,
      ];
    }

    return BACKSTOP_NAMES.includes(name) && now < was
      ? [
          `${name} fell from ${was} to ${now}: the coverage backstops may only rise; lowering one needs a human ruling`,
        ]
      : [];
  });
  const pinned = PINNED_LINES.filter((line) => !head.includes(line)).map(
    (line) =>
      `vite.config.ts must contain, verbatim, \`${line}\`: the thresholds use the constants, never an inline number`,
  );
  const keys = head.match(THRESHOLD_KEY)?.length ?? 0;

  return [
    ...moves,
    ...pinned,
    ...(keys === PINNED_LINES.length
      ? []
      : [
          `thresholds holds ${keys} statements/branches/functions keys, expected ${PINNED_LINES.length}: no extra or duplicate threshold`,
        ]),
  ];
}
