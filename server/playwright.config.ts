import { defineConfig } from '@playwright/test';

const PORT = 3100;
const DB = process.env.E2E_DATABASE_URL ?? 'postgres://shomal:pw@127.0.0.1:5433/shomaldoc_e2e';

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, locale: 'fa-IR', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined } } }],
  webServer: {
    command: 'npx tsx --tsconfig tsconfig.json src/index.ts',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { PORT: String(PORT), DATABASE_URL: DB, UPLOAD_DIR: '/tmp/shomaldoc-e2e-uploads', DISABLE_JOBS: 'true', RATE_LOGIN: '200', CHROMIUM_PATH: process.env.CHROMIUM_PATH ?? '' },
  },
});
