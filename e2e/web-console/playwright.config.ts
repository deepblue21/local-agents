import { defineConfig, devices } from '@playwright/test';

const PYTHON = process.env.LOCAL_AGENTS_PYTHON ?? 'python3';
const API_PORT = process.env.LOCAL_AGENTS_E2E_PORT ?? '8799';
const STUB_PORT = process.env.STUB_OLLAMA_PORT ?? '11500';

export const ADMIN_TOKEN = 'e2e-admin-token-0123456789abcdefghijklmnop';
export const BASE_URL = `http://127.0.0.1:${API_PORT}`;

// Environments that ship a pre-installed Chromium (rather than one downloaded by
// `playwright install`) can point the run at it instead.
const browserOverride = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
  : {};

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['line']],
  use: {
    baseURL: BASE_URL,
    // Pinned so assertions can rely on the English string table regardless of the
    // host machine's locale.
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...browserOverride } },
    { name: 'mobile', use: { ...devices['Pixel 7'], ...browserOverride } },
  ],
  webServer: [
    {
      command: `${PYTHON} fixtures/stub_ollama.py`,
      url: `http://127.0.0.1:${STUB_PORT}/api/tags`,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      env: { STUB_OLLAMA_PORT: STUB_PORT },
    },
    {
      command: `${PYTHON} -m uvicorn local_agents.main:app --host 127.0.0.1 --port ${API_PORT}`,
      cwd: '../../server',
      url: `${BASE_URL}/health`,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      env: {
        LOCAL_AGENTS_ADMIN_TOKEN: ADMIN_TOKEN,
        LOCAL_AGENTS_DATABASE: process.env.LOCAL_AGENTS_DATABASE ?? '.e2e/web-console.db',
        LOCAL_AGENTS_OLLAMA_URL: `http://127.0.0.1:${STUB_PORT}`,
        LOCAL_AGENTS_DEFAULT_MODEL: 'qwen3.6',
        LOCAL_AGENTS_PUBLIC_URL: BASE_URL,
        LOCAL_AGENTS_WEB_SEARCH_PROVIDER: 'disabled',
        LOCAL_AGENTS_PAIRING_CODE_MINUTES: '30',
        // Keep the auth budget out of the way: one spec pairs several times.
        LOCAL_AGENTS_AUTH_RATE_LIMIT_PER_MINUTE: '0',
      },
    },
  ],
});
