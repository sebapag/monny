import { defineConfig, devices } from '@playwright/test'

const PORT = 5173
const BASE = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 90_000,
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5173',
    url: BASE,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      VITE_ATRIUM_RUNTIME: 'fixtures',
    },
    timeout: 120_000,
  },
  projects: [
    {
      name: 'mobile-chrome',
      testMatch: /office-mobile\.spec\.ts/,
      use: {
        ...devices['Pixel 5'],
        channel: undefined,
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'desktop-chrome',
      testMatch: /office-motion\.spec\.ts/,
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'desktop-walkers-admin',
      testMatch: /office-walkers-admin\.spec\.ts/,
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'desktop-brand-lockup',
      testMatch: /brand-lockup\.spec\.ts/,
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
})
