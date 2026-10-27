import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { handleApi } from './fixtures.mjs';
const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:5173',
  OUT = '.verify/figma';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(),
  checks = [],
  errors = [];
const analytics = ['portfolio', 'risk', 'signals', 'backtest', 'factors'];
async function setup(width, height, signed = true) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await context.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, '');
    if (path === '/auth/refresh' && !signed)
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    let body;
    try {
      body = route.request().postDataJSON();
    } catch {}
    const result = handleApi(path, route.request().method(), body);
    return route.fulfill({
      status: result.status,
      contentType: 'application/json',
      body: result.body,
    });
  });
  return context;
}
async function inspect(page, name, fullPage = true) {
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(async () => {
    const issues = [];
    for (const family of ['Geist', 'Space Grotesk'])
      for (const weight of [400, 700]) {
        const faces = await document.fonts.load(`${weight} 16px "${family}"`);
        if (!faces.length || faces.some((face) => face.status !== 'loaded'))
          issues.push(`Missing ${family} ${weight}`);
      }
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('Horizontal overflow');
    const h = document.querySelector('.page-intro h1,.landing-hero h1,.auth-form h2'),
      heading = h
        ? {
            family: getComputedStyle(h).fontFamily,
            size: getComputedStyle(h).fontSize,
            weight: getComputedStyle(h).fontWeight,
          }
        : null;
    if (!getComputedStyle(document.documentElement).fontFamily.includes('Geist'))
      issues.push('Wrong body font');
    if (heading && !heading.family.includes('Space Grotesk')) issues.push('Wrong heading font');
    if (heading && heading.weight !== '700') issues.push('Wrong heading weight');
    for (const img of document.images)
      if (!img.complete || !img.naturalWidth) issues.push('Missing asset ' + img.src);
    return { issues, heading };
  });
  checks.push({ name, ...result });
  if (result.issues.length) errors.push({ name, ...result });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}
try {
  for (const [device, width, height] of [
    ['desktop', 1440, 1024],
    ['tablet', 834, 1194],
    ['mobile', 390, 844],
  ]) {
    const context = await setup(width, height),
      page = await context.newPage();
    page.on('pageerror', (e) => errors.push({ name: device, error: e.message }));
    for (const route of [...analytics, 'subscription', 'account']) {
      await page.goto(BASE + '/' + route, { waitUntil: 'networkidle' });
      await page
        .locator(
          route === 'subscription'
            ? '.plans-grid'
            : route === 'account'
              ? '.account-grid'
              : '.widgets-grid',
        )
        .waitFor();
      await inspect(page, `${route}-${device}`);
      if (route === 'portfolio') {
        const actual = await page
            .locator('.page-intro h1')
            .evaluate((el) => getComputedStyle(el).fontSize),
          expected = device === 'desktop' ? 47.52 : device === 'tablet' ? 27.455 : 32;
        if (Math.abs(parseFloat(actual) - expected) > 0.01)
          errors.push({ name: device, error: `Expected ${expected}px, got ${actual}` });
      }
      if (analytics.includes(route)) {
        await page.setViewportSize(
          device === 'desktop'
            ? { width: 1600, height: 1100 }
            : device === 'tablet'
              ? { width: 1194, height: 834 }
              : { width, height },
        );
        if (device === 'mobile') {
          await page.getByRole('button', { name: 'Open menu', exact: true }).click();
          await page.getByRole('button', { name: /doFiin Studio/ }).click();
        } else await page.getByRole('button', { name: 'Open Studio', exact: true }).click();
        await expect(page.getByRole('tab', { name: 'Appearance', exact: true })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Function', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Add Menu', exact: true })).toBeVisible();
        await inspect(page, `studio-${route}-${device}`, false);
        await page.getByRole('tab', { name: 'Function', exact: true }).click();
        await expect(page.getByRole('tabpanel')).toContainText('Data & rules');
        await page.getByRole('button', { name: 'Close Studio', exact: true }).click();
        await page.setViewportSize({ width, height });
      }
    }
    await context.close();
    const pub = await setup(width, height, false),
      p = await pub.newPage();
    for (const [name, path] of [
      ['landing', ''],
      ['login', 'sign-in'],
      ['register', 'sign-up'],
    ]) {
      await p.goto(BASE + '/' + path, { waitUntil: 'networkidle' });
      await p.locator(name === 'landing' ? '.landing' : '.auth-form').waitFor();
      await inspect(p, `${name}-${device}`);
    }
    await pub.close();
  }
  const context = await setup(1440, 1024),
    page = await context.newPage();
  page.on('pageerror', (e) => errors.push({ name: 'interaction', error: e.message }));
  await page.goto(BASE + '/portfolio', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open Studio', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Risk menu', exact: true }).click();
  await page.getByRole('button', { name: 'Add Menu', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Add navigation menu', exact: true })
    .selectOption('risk');
  await page.getByLabel('Legend', { exact: true }).selectOption('false');
  await page.getByLabel('Corner radius', { exact: true }).selectOption('8');
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close Studio', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.sidebar nav .nav-item').nth(4)).toContainText('Risk');
  await expect(page.locator('.dashboard')).toHaveAttribute('data-legend', 'false');
  await expect(page.locator('.widget-growth')).toHaveCSS('border-radius', '8px');
  checks.push({ name: 'Studio save/reload/menu/legend/corners', issues: [] });
  await context.close();
} catch (error) {
  errors.push({ error: error.message });
} finally {
  await browser.close();
}
writeFileSync(
  `${OUT}/report.json`,
  JSON.stringify({ screens: checks.length, checks, errors }, null, 2),
);
console.log(
  JSON.stringify({ screens: checks.length, errors, report: `${OUT}/report.json` }, null, 2),
);
if (errors.length) process.exitCode = 1;
