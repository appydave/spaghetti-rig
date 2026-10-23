import { defineConfig } from "@playwright/test";

const inCI = !!process.env.CI;
// The dev server the tests drive; vite.config.ts makes it listen on the same port.
const DEV_PORT = 5173;
// One slow test (the full tier walk) can take minutes on a busy runner.
const TEST_TIMEOUT_MS = 180_000;
// Wide enough for the two 3D lanes side by side.
const VIEWPORT_WIDTH = 1600;
const VIEWPORT_HEIGHT = 900;
const SERVER_START_TIMEOUT_MS = 60_000;
// The game renders two 3D lanes: in software WebGL (Linux runners, no GPU) it runs under 1 fps, too slow for its wall-clock
// timing. Apple machines, Roamy and the macOS CI runner alike, render on the GPU through Metal.
const gpuArgs =
  process.platform === "darwin"
    ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]
    : [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ];

export default defineConfig({
  testDir: "tests",
  timeout: TEST_TIMEOUT_MS,
  workers: 1,
  forbidOnly: inCI,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${DEV_PORT}`,
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    launchOptions: {
      args: [...gpuArgs, "--autoplay-policy=no-user-gesture-required"],
    },
  },
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${DEV_PORT}`,
    reuseExistingServer: !inCI,
    timeout: SERVER_START_TIMEOUT_MS,
  },
});
