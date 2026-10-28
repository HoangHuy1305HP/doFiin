import { chromium, expect } from '@playwright/test';
import { handleApi } from './fixtures.mjs';

const base = process.env.VERIFY_BASE || 'http://127.0.0.1:5173';
const browser = await chromium.launch();
let checks = 0;

async function contextWithApi(signedIn) {
  const context = await browser.newContext();
  await context.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, '');
    if (path === '/auth/refresh' && !signedIn)
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    let body;
    try {
      body = route.request().postDataJSON();
    } catch {}
    const response = handleApi(path, route.request().method(), body);
    return route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: response.body,
    });
  });
  return context;
}

try {
  const signed = await contextWithApi(true);
  const page = await signed.newPage();
  await page.goto(base + '/portfolio');
  await expect(page.locator('.widgets-grid')).toBeVisible();
  await expect(page).toHaveURL(base + '/portfolio');
  checks++;

  await page.getByRole('link', { name: 'doFiin home' }).first().click();
  await expect(page).toHaveURL(base + '/');
  await expect(page.locator('.landing')).toBeVisible();
  await page.goto(base + '/portfolio');
  await expect(page.locator('.widgets-grid')).toBeVisible();
  checks++;
  await page.getByRole('switch', { name: 'Studio mode' }).click();
  await page.locator('.studio-header').getByRole('link', { name: 'doFiin home' }).click();
  await expect(page).toHaveURL(base + '/');
  await expect(page.locator('.landing')).toBeVisible();
  await page.goto(base + '/portfolio');
  await expect(page.locator('.widgets-grid')).toBeVisible();
  checks++;

  await page.getByRole('link', { name: 'Risk', exact: true }).first().click();
  await expect(page).toHaveURL(base + '/risk');
  await expect(page.locator('.page-intro h1')).toContainText('Risk, from every angle.');
  await page.goBack();
  await expect(page).toHaveURL(base + '/portfolio');
  await page.goForward();
  await expect(page).toHaveURL(base + '/risk');
  await page.reload();
  await expect(page.locator('.widgets-grid')).toBeVisible();
  checks++;

  await page.goto(base + '/#signals');
  await expect(page).toHaveURL(base + '/signals');
  checks++;

  await page.goto(base + '/not-a-route');
  await expect(page).toHaveURL(base + '/portfolio');
  checks++;
  await signed.close();

  const unsigned = await contextWithApi(false);
  const guestPage = await unsigned.newPage();
  await guestPage.goto(base + '/factors');
  await expect(guestPage).toHaveURL(base + '/sign-in');
  await expect(guestPage.getByRole('button', { name: 'Explore demo' })).toHaveCount(0);
  await guestPage.getByLabel('Email').fill('demo@example.com');
  await guestPage.locator('input[autocomplete="current-password"]').fill('fixture-password');
  await guestPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(guestPage).toHaveURL(base + '/factors');
  await expect(guestPage.locator('.widgets-grid')).toBeVisible();
  checks++;
  await guestPage.locator('.sidebar-user').click();
  await guestPage.getByRole('button', { name: 'Sign out' }).click();
  await expect(guestPage).toHaveURL(base + '/');
  await expect(guestPage.locator('.landing')).toBeVisible();
  checks++;
  await guestPage.goto(base + '/sign-in');
  await guestPage.getByRole('link', { name: 'doFiin home' }).first().click();
  await expect(guestPage).toHaveURL(base + '/');
  await guestPage.goto(base + '/sign-in');
  checks++;
  await guestPage.getByRole('button', { name: /Sign up free/ }).click();
  await expect(guestPage).toHaveURL(base + '/sign-up');
  await guestPage.getByRole('button', { name: /Sign in →/ }).click();
  await expect(guestPage).toHaveURL(base + '/sign-in');
  checks++;
  const favicon = await guestPage.request.get(base + '/favicon.svg');
  expect(favicon.ok()).toBeTruthy();
  expect(await favicon.text()).toContain('stroke="#ffffff"');
  checks++;
  await unsigned.close();
} finally {
  await browser.close();
}

console.log(`Routing checks passed: ${checks}`);
