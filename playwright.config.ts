import { defineConfig } from "@playwright/test";

const inCI = !!process.env.CI;
// The dev server the tests drive: 5173 unless DEV_PORT says otherwise; vite.config.ts reads the same variable.
const DEFAULT_DEV_PORT = 5173;
const DEV_PORT = Number(process.env.DEV_PORT ?? DEFAULT_DEV_PORT);
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
  // Committed snapshots sit in tests/__snapshots__ with no browser or platform suffix: a colour is a colour on every machine.
  snapshotPathTemplate: "{testDir}/__snapshots__/{arg}{ext}",
  timeout: TEST_TIMEOUT_MS,
  workers: 1,
  forbidOnly: inCI,
  // CI only compares: a missing snapshot fails there instead of being written. Locally a missing one is written (and the run fails once).
  updateSnapshots: inCI ? "none" : "missing",
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
    // Never run the tests against a server somebody else started: if the port is taken, fail.
    reuseExistingServer: false,
    timeout: SERVER_START_TIMEOUT_MS,
  },
});
