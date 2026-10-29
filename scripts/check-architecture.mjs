// Fails when the code breaks an architecture rule (G13 module cohesion, G14 coupling and hubs). Run by `npm run lint:architecture` and the Architecture job in CI.
import { describe, scan } from "../lint/gates/architecture.mjs";

// An optional folder named src to scan instead of the real one: the gate's probes use it.
const findings = scan(process.argv[2]);

if (findings.length === 0) {
  console.log("check-architecture: no findings");
} else {
  console.error(
    `check-architecture failed:\n${findings.map((f) => describe(f)).join("\n")}`,
  );
}

process.exit(findings.length === 0 ? 0 : 1);
