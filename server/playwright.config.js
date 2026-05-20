const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  fullyParallel: false,
  retries: 0,
  workers: 1,

  reporter: [['list']],

  webServer: {
    command: 'npm start',
    cwd: __dirname,
    url: 'http://127.0.0.1:3000/health',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      E2E_CAPTURE_MAIL: '1',
    },
  },

  use: {
    baseURL: 'http://localhost:3000',
    headless: false,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],

  outputDir: './e2e/test-results',
});
