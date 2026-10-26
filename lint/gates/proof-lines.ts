// How a proof harness's log is committed: one fingerprint per line, "<scenario> | <fingerprint>", so a changed sample is a changed line in the diff.
export const logLines = (log: Record<string, string[]>) =>
  `${Object.entries(log)
    .flatMap(([scenario, prints]) =>
      prints.map((print) => `${scenario} | ${print}`),
    )
    .join("\n")}\n`;
