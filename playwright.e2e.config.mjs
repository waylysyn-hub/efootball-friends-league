import { defineConfig } from '@playwright/test';
import { localConfig } from './tests/e2e/local-backend.mjs';
localConfig();
export default defineConfig({
  testDir: './tests/e2e', testMatch: '*.spec.mjs', workers: 1, fullyParallel: false,
  timeout: 60000, expect: { timeout: 10000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/e2e', open: 'never' }]],
  outputDir: 'test-results/e2e',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev:live -- --mode e2e --host 127.0.0.1', url: 'http://127.0.0.1:4173/league/index.html', reuseExistingServer: false },
  projects: [320, 375, 414, 1366].map(width => ({ name: 'auth-db-' + width, use: { viewport: { width, height: 844 } } })),
});
