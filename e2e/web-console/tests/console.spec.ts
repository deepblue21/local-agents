import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN_TOKEN } from '../playwright.config';

/**
 * Browser end-to-end coverage for the web console.
 *
 * The companion runs against a stub Ollama (see fixtures/stub_ollama.py), so the
 * full path — pair, create a session, stream a reply, control the run — is exercised
 * without a real model.
 */

async function pairingCode(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/v1/admin/pairing', {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).code;
}

async function pair(page: Page, request: APIRequestContext) {
  const code = await pairingCode(request);
  await page.goto('/app');
  await page.locator('#pair-code').fill(code);
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByRole('button', { name: 'New chat' }).first()).toBeVisible();
}

/**
 * Reach the session list.
 *
 * On desktop the rail always shows it, so there is no tab to press; on mobile the
 * bottom bar carries one.
 */
async function openSessions(page: Page) {
  const tab = page.getByRole('button', { name: 'Sessions' });
  if (await tab.count()) await tab.first().click();
}

/** The visible session row for a title, whether it lives in the rail or the view. */
function sessionRow(page: Page, title: string) {
  return page.locator('.rail-row:visible').filter({ hasText: title }).first();
}

/** Start a conversation and wait for the agent's streamed reply to settle. */
async function runPrompt(page: Page, prompt: string) {
  await page.getByRole('button', { name: 'New chat' }).first().click();
  const composer = page.getByRole('textbox', { name: 'Describe the task…' });
  await expect(composer).toBeEnabled();
  await composer.fill(prompt);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.msg.user .bubble').last()).toHaveText(prompt);
  await expect(page.locator('.msg.agent .bubble').last())
    .toContainText('test yanıtıdır', { timeout: 30_000 });
}

test('pairing screen previews companion health before a code is entered', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: /Connect this browser/ })).toBeVisible();
  await expect(page.locator('.host-preview')).toContainText('online');
  // The stub advertises the configured default model.
  await expect(page.locator('.host-preview')).toContainText('qwen3.6 ready');
});

test('an invalid pairing code is rejected without signing in', async ({ page }) => {
  await page.goto('/app');
  await page.locator('#pair-code').fill('AAAA BBBB CCCC DDDD EEEE FFFF');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.locator('.toast.bad')).toBeVisible();
  await expect(page.locator('#pair-code')).toBeVisible();
});

test('pairing code input is grouped into four-character blocks', async ({ page }) => {
  await page.goto('/app');
  const input = page.locator('#pair-code');
  await input.fill('abcd1234efgh');
  await expect(input).toHaveValue('ABCD · 1234 · EFGH');
});

test('pair, prompt, and stream a reply end to end', async ({ page, request }) => {
  await pair(page, request);
  await runPrompt(page, 'e2e streaming task');

  // The conversation is renamed after its first prompt.
  await openSessions(page);
  await expect(sessionRow(page, 'e2e streaming task')).toBeVisible();
});

test('context usage is reported after a run', async ({ page, request }) => {
  await pair(page, request);
  await runPrompt(page, 'e2e context task');
  await expect(page.locator('.context-bar')).toContainText('Context');
  await expect(page.locator('.context-bar')).toContainText('tokens');
  await expect(page.locator('.context-track')).toBeVisible();
});

test('sessions can be renamed and deleted', async ({ page, request }) => {
  await pair(page, request);
  await runPrompt(page, 'e2e lifecycle task');
  await openSessions(page);

  const row = sessionRow(page, 'e2e lifecycle task');
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Rename' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.locator('input').fill('renamed by e2e');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(sessionRow(page, 'renamed by e2e')).toBeVisible();

  await sessionRow(page, 'renamed by e2e').getByRole('button', { name: 'Delete' }).click();
  const confirm = page.locator('dialog[open]');
  await expect(confirm).toContainText('permanently deleted');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.rail-row:visible').filter({ hasText: 'renamed by e2e' }))
    .toHaveCount(0);
});

test('models view lists the stub provider models and selection sticks', async ({ page, request }) => {
  await pair(page, request);
  await page.getByRole('button', { name: 'Models' }).first().click();
  await expect(page.locator('.view')).toContainText('qwen3.6');
  await expect(page.locator('.view')).toContainText('llama3.2:latest');

  await page.locator('.view .model-card').filter({ hasText: 'llama3.2:latest' }).first().click();
  await expect(page.locator('.view .model-card').filter({ hasText: 'llama3.2:latest' }).first())
    .toHaveAttribute('aria-current', 'true');
});

test('theme choice applies immediately and survives a reload', async ({ page, request }) => {
  await pair(page, request);
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.getByRole('button', { name: 'Terminal' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'terminal');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'terminal');
});

test('the session survives a reload without re-entering a code', async ({ page, request }) => {
  await pair(page, request);
  await page.reload();
  // The refresh cookie mints a new access token silently: no pairing form.
  await expect(page.getByRole('button', { name: 'New chat' }).first()).toBeVisible();
  await expect(page.locator('#pair-code')).toHaveCount(0);
});

test('disconnecting returns to the pairing screen and cannot be resumed', async ({ page, request }) => {
  await pair(page, request);
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.locator('#pair-code')).toBeVisible();

  await page.reload();
  await expect(page.locator('#pair-code')).toBeVisible();
});

test('the refresh token is not reachable from page script', async ({ page, request }) => {
  await pair(page, request);
  const cookies = await page.evaluate(() => document.cookie);
  expect(cookies).not.toContain('la_refresh');
  // The CSRF value is readable on purpose so the console can echo it in a header.
  expect(cookies).toContain('la_csrf');
});

test('rail controls stay inside the rail and remain clickable', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the rail only renders on wide viewports');
  await pair(page, request);

  const rail = await page.locator('.rail').boundingBox();
  expect(rail).not.toBeNull();
  for (const button of await page.locator('.rail-foot button').all()) {
    const box = await button.boundingBox();
    // A grid item defaulting to min-width:auto used to push this row past the rail,
    // where the main column covered it and swallowed the click.
    expect(box!.x + box!.width).toBeLessThanOrEqual(rail!.x + rail!.width + 1);
  }

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('.view')).toContainText('Session security');
});

test('session actions are reachable without hover', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'touch viewports have no hover state');
  await pair(page, request);
  await runPrompt(page, 'e2e touch actions');
  await openSessions(page);

  // Hover-only affordances are invisible forever on a touch device.
  const actions = sessionRow(page, 'e2e touch actions').getByRole('button', { name: 'Delete' });
  await expect(actions).toBeVisible();
  expect(await actions.evaluate((node) => getComputedStyle(node).opacity)).toBe('1');
});

test('the console page ships no inline script and declares a strict CSP', async ({ page }) => {
  const response = await page.goto('/app');
  const csp = response?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).toContain("frame-ancestors 'none'");

  const inlineScripts = await page.locator('script:not([src])').count();
  expect(inlineScripts).toBe(0);
});

test('agent output is rendered as text, never as markup', async ({ page, request }) => {
  await pair(page, request);
  await runPrompt(page, '<img src=x onerror="window.__xss=1">');
  expect(await page.evaluate(() => (window as never as { __xss?: number }).__xss)).toBeUndefined();
  await expect(page.locator('.msg.user .bubble img')).toHaveCount(0);
});

test('the admin page mints a pairing code with the admin token', async ({ page }) => {
  await page.goto('/admin');
  await page.locator('#admin-token').fill(ADMIN_TOKEN);
  await page.getByRole('button', { name: 'Eşleştirme kodu üret' }).click();
  await expect(page.getByAltText('Eşleştirme QR kodu')).toBeVisible();

  await page.getByRole('button', { name: 'Cihazlar' }).click();
  await expect(page.locator('#output')).toBeVisible();
});

test('the admin page rejects a wrong admin token', async ({ page }) => {
  await page.goto('/admin');
  await page.locator('#admin-token').fill('not-the-admin-token');
  await page.getByRole('button', { name: 'Eşleştirme kodu üret' }).click();
  await expect(page.locator('.toast.bad')).toContainText('authorization failed');
});
