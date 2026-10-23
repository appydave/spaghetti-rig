import { defineConfig } from '@playwright/test';

const inCI = !!process.env.CI;
// The game renders two 3D lanes: in software WebGL (Linux runners, no GPU) it runs under 1 fps, too slow for its wall-clock
// timing. Apple machines, Roamy and the macOS CI runner alike, render on the GPU through Metal.
const gpuArgs = process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

export default defineConfig({
  testDir: 'tests',
  timeout: 180_000,
  workers: 1,
  forbidOnly: inCI,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1600, height: 900 },
    launchOptions: { args: [...gpuArgs, '--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: !inCI, timeout: 60_000 },
});
