import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Listen on the network so another machine (e.g. the stage Mac) can open it by name:
  // Bonjour names (roamy.local) and Tailscale MagicDNS names (*.ts.net) are allowed.
  server: { port: 5173, host: true, allowedHosts: ['.local', '.ts.net'] },
  preview: { port: 5173, host: true, allowedHosts: ['.local', '.ts.net'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
