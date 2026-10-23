// Fails when a test report holds a skipped, todo or flaky test: a green tick must mean every test ran.
// Usage: node scripts/assert-no-skips.mjs <playwright|vitest> <report.json>
import { readFileSync } from 'node:fs';

const [kind, file] = process.argv.slice(2);
const report = JSON.parse(readFileSync(file, 'utf8'));
const counts = {
  playwright: { skipped: report.stats?.skipped, flaky: report.stats?.flaky, ran: report.stats?.expected },
  vitest: { skipped: report.numPendingTests, flaky: report.numTodoTests, ran: report.numPassedTests },
}[kind];

if (!counts || !counts.ran || counts.skipped !== 0 || counts.flaky !== 0) {
  console.error(`${kind}: expected tests to run with 0 skipped and 0 flaky/todo, got ${JSON.stringify(counts)}`);
  process.exit(1);
}
console.log(`${kind}: ${counts.ran} tests ran, 0 skipped`);
