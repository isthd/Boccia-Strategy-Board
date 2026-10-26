import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [
    // iPad Safari 相当（WebKit・タッチ・横向き）
    { name: 'ipad-webkit-landscape', use: { ...devices['iPad Pro 11 landscape'] } },
    // iPad 縦向き（Chromium・タッチ）
    { name: 'ipad-chromium-portrait', use: { ...devices['iPad (gen 7)'], browserName: 'chromium', defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
