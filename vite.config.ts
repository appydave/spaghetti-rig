import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Listen on the network so another machine (e.g. the stage Mac) can open it by name:
  // Bonjour names (roamy.local) and Tailscale MagicDNS names (*.ts.net) are allowed.
  server: { port: 5173, host: true, allowedHosts: ['.local', '.ts.net'] },
  preview: { port: 5173, host: true, allowedHosts: ['.local', '.ts.net'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      // Count every source file, not only the ones a test imports, so an untested file lowers the numbers.
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      // The floor is the measured coverage on 2026-10-23 rounded down: it fails if coverage falls.
      thresholds: { statements: 11, branches: 17, functions: 17, lines: 12 },
    },
  },
});
