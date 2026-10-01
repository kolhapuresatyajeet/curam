import { defineConfig } from '@playwright/test';

// Cúram E2E — positive flows, meant to be WATCHED:
//   npm run test:e2e            → headed Chromium, slowMo, video recorded
//   npm run test:e2e -- --headed --slow-mo=500   (tune watchability)
//   npm run test:e2e -- --headless              (CI / fast runs)
//
// Runs against the Vite dev server in DEMO mode (Supabase env blanked): the
// demo seed boots with a live session, so flows run with realistic seeded
// data and never touch the cloud project. Cloud functions are covered by the
// email suite's live smoke (CURAM_LIVE_SMOKE=1 npm run test:email).

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  outputDir: 'test-results/e2e',
  use: {
    baseURL: 'http://localhost:5199',
    headless: false, // watch the flows live in a real browser window
    viewport: { width: 1440, height: 900 },
    video: 'on', // every test recorded under test-results/
    launchOptions: { slowMo: Number(process.env.SLOW_MO ?? 200) }, // human-visible pace
  },
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      ...process.env,
      // blank the Supabase env → app boots in demo mode with seeded data
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
});
