import { defineConfig } from "vitest/config";

export default defineConfig({
  // Listen on the network so another machine (e.g. the stage Mac) can open it by name:
  // Bonjour names (roamy.local) and Tailscale MagicDNS names (*.ts.net) are allowed.
  server: { port: 5173, host: true, allowedHosts: [".local", ".ts.net"] },
  preview: { port: 5173, host: true, allowedHosts: [".local", ".ts.net"] },
  build: { target: "es2022", chunkSizeWarningLimit: 6000 },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      // Count every source file, not only the ones a test imports, so an untested file lowers the numbers.
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      // The floor is the measured coverage on 2026-10-23 rounded down to one decimal: it fails if coverage falls.
      // Lines was re-measured after Prettier (G01) split one-line statements across lines: 12.38% before, 10.55% after,
      // same code and same tests; statements, branches and functions did not move.
      thresholds: {
        statements: 11.1,
        branches: 17.6,
        functions: 17.5,
        lines: 10.5,
      },
    },
  },
});
