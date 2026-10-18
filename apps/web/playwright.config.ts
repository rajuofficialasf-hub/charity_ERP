import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

// E2E tests run against the E2E build served by `vite preview` (`pnpm e2e` builds first). Every spec
// runs on Chromium as a phone and a desktop; the sign-in, registration and home specs also run on
// WebKit as an iPhone (some volunteers use iPhones). Offline emulation comes with the offline
// PWA, which is not built yet.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0, // one reported retry in E2E only (O-46 item 10)
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'iphone',
      use: { ...devices['iPhone 13'] },
      testMatch: ['**/auth.spec.ts', '**/registration.spec.ts', '**/home.spec.ts'],
    },
  ],
  // The API on its own E2E database (seeded with the demo accounts, dummy OTP), then the web
  // build whose /api/v1 rewrite points at it. The projects share the database, so specs
  // that change data use different accounts per project.
  webServer: [
    {
      command: 'pnpm --filter @css/api e2e:server',
      url: 'http://127.0.0.1:4100/health/live',
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: 'pipe',
    },
    {
      command: `pnpm exec vite preview --port ${PORT}`,
      // The preview server proxies /api/v1 to the E2E API (vite.config.ts reads CSS_API_ORIGIN).
      env: { CSS_API_ORIGIN: 'http://127.0.0.1:4100' },
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
