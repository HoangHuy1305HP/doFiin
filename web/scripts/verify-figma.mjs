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
    if (!document.querySelector('.brand-monogram svg'))
      issues.push('Missing dolphin brand mark');
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
      await expect(page.locator('.topbar-period, .topbar-demo, .topbar-settings')).toHaveCount(0);
      await expect(page.locator('.studio-teaser')).toHaveCount(0);
      if (route === 'subscription') {
        await expect(page.locator('.comparison-section tbody td').first()).toHaveCSS('font-size', '16px');
        if (device === 'mobile')
          await expect(page.locator('.comparison-scroll-hint')).toBeVisible();
      }
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
        await expect(page.getByRole('switch', { name: 'Studio mode' })).toHaveAttribute('aria-checked', 'false');
        await page.getByRole('switch', { name: 'Studio mode' }).click();
        await expect(page.getByRole('switch', { name: 'Studio mode' })).toHaveAttribute('aria-checked', 'true');
        await expect(page.getByRole('tab', { name: 'Content', exact: true })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Design', exact: true })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Function', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Add menu item', exact: true })).toBeVisible();
        await expect(page.getByRole('combobox', { name: 'Content language' })).toBeVisible();
        await inspect(page, `studio-${route}-${device}`, false);
        await page.getByRole('tab', { name: 'Function', exact: true }).click();
        await expect(page.getByRole('tabpanel')).toContainText('Data & rules');
        await expect(page.getByRole('combobox', { name: 'Studio analysis period' })).toBeVisible();
        await expect(page.getByRole('combobox', { name: 'Studio data source' })).toBeVisible();
        if (route === 'portfolio')
          await expect(page.getByRole('button', { name: 'Edit portfolio holdings & weights' })).toBeVisible();
        if (route === 'backtest')
          await expect(page.getByRole('tabpanel')).toContainText('Backtest rules');
        await page.getByRole('switch', { name: 'Studio mode' }).click();
        await expect(page.locator('.studio-shell')).toHaveCount(0);
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
      if (name === 'login')
        await expect(p.getByRole('button', { name: 'Explore demo' })).toHaveCount(0);
      if (name === 'register')
        await expect(p.getByRole('button', { name: 'Explore demo' })).toBeVisible();
      if (name === 'landing') {
        const comparison = p.getByRole('region', { name: 'Plan comparison' });
        await expect(comparison.locator('thead th')).toHaveCount(5);
        await expect(comparison.locator('tbody td').first()).toHaveCSS('font-size', '16px');
        await expect(comparison.locator('thead th').nth(1)).toHaveCSS('text-align', 'center');
        await expect(comparison.locator('tbody td').first()).toHaveCSS('text-align', 'center');
        await expect(p.locator('#pricing .landing-pricing-grid h3').first()).toHaveCSS('font-size', '24px');
        await expect(p.locator('#pricing .landing-pricing-grid p').first()).toHaveCSS('font-size', '14px');
        await expect(p.locator('.landing-nav .button')).toHaveCSS('font-size', '16px');
        await expect(p.locator('.landing-nav .text-button')).toHaveCSS('font-size', '16px');
        await expect(comparison.getByRole('row', { name: /Personalized workflows/ })).toContainText('By agreement');
        await expect(comparison.locator('thead')).toContainText('Let’s Talk');
        if (device === 'mobile')
          await expect(p.locator('.landing-comparison-hint')).toBeVisible();
        if (device !== 'mobile') {
          const cardPositions = await p.locator('#pricing .landing-pricing-grid article').evaluateAll((cards) =>
            cards.map((card) => ({
              row: card.getBoundingClientRect().top,
              price: card.querySelector('strong').getBoundingClientRect().top,
              features: card.querySelector('li').getBoundingClientRect().top,
            })),
          );
          for (const card of cardPositions) {
            const rowStart = cardPositions.find((item) => item.row === card.row);
            expect(Math.abs(card.price - rowStart.price)).toBeLessThan(1);
            expect(Math.abs(card.features - rowStart.features)).toBeLessThan(1);
          }
        }
        checks.push({ name: `Landing plan comparison ${device}`, issues: [] });
      }
      if (name === 'landing' && device === 'desktop') {
        const cards = p.locator('#pricing .landing-pricing-grid article');
        await expect(cards).toHaveCount(4);
        await expect(cards.nth(1)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
        await expect(p.getByRole('button', { name: 'Coming soon' })).toBeDisabled();
        await expect(cards.nth(3)).toContainText('Pricing by agreement');
        await cards.nth(1).hover();
        await expect(cards.nth(1)).toHaveCSS('background-color', 'rgb(45, 118, 88)');
        checks.push({ name: 'Landing pricing hover and coming-soon plan', issues: [] });
      }
    }
    await pub.close();
  }
  const context = await setup(1440, 1024),
    page = await context.newPage();
  page.on('pageerror', (e) => errors.push({ name: 'interaction', error: e.message }));
  await page.goto(BASE + '/portfolio', { waitUntil: 'networkidle' });
  await page.getByRole('switch', { name: 'Studio mode' }).click();
  await page.getByRole('combobox', { name: 'Content language' }).selectOption('vi-VN');
  await page.getByRole('textbox', { name: 'Heading' }).fill('Hiểu rõ danh mục của bạn');
  await page.getByRole('textbox', { name: 'Description' }).fill('Nội dung tiếng Việt dành riêng cho trang này.');
  await expect(page.locator('.studio-preview-heading h2')).toHaveText('Hiểu rõ danh mục của bạn');
  await page.locator('.studio-left .studio-tree-select').filter({ hasText: 'Risk' }).click();
  await page.getByRole('button', { name: 'Remove from menu', exact: true }).click();
  await page.getByRole('button', { name: 'Add menu item', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Add navigation menu', exact: true })
    .selectOption('risk');
  await page.getByRole('tab', { name: 'Design', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show legend' }).uncheck();
  await page.getByRole('combobox', { name: 'Corner radius' }).selectOption('8');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('.studio-header-status')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Close Studio', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.sidebar nav .nav-item').nth(4)).toContainText('Risk');
  await expect(page.locator('.page-intro h1')).toHaveText('Hiểu rõ danh mục của bạn');
  await expect(page.locator('.dashboard')).toHaveAttribute('data-legend', 'false');
  await expect(page.locator('.widget-growth')).toHaveCSS('border-radius', '8px');
  checks.push({ name: 'Studio save/reload/menu/legend/corners', issues: [] });
  await page.getByRole('switch', { name: 'Studio mode' }).click();
  await page.getByRole('combobox', { name: 'Studio page' }).selectOption('risk');
  await expect(page).toHaveURL(BASE + '/risk');
  await expect(page.locator('.studio-panel-heading')).toContainText('Risk');
  await page.locator('.studio-left .studio-tree-select').filter({ hasText: 'Relationships between assets' }).click();
  await expect(page.locator('.studio-inspector-heading')).toContainText('Relationships between assets');
  await page.getByRole('button', { name: 'Close Studio', exact: true }).click();
  checks.push({ name: 'Studio page selector and contextual widget inspector', issues: [] });
  await page.goto(BASE + '/portfolio', { waitUntil: 'networkidle' });
  await page.getByRole('switch', { name: 'Studio mode' }).click();
  await page.getByRole('tab', { name: 'Function', exact: true }).click();
  await page.getByRole('combobox', { name: 'Studio analysis period' }).selectOption('6M');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('.studio-shell')).toHaveCount(0);
  await expect(page.locator('.page-intro .eyebrow')).toContainText('6M');
  await expect(page.locator('.widgets-grid')).toBeVisible();
  await page.getByRole('switch', { name: 'Studio mode' }).click();
  await page.getByRole('tab', { name: 'Function', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Studio analysis period' })).toHaveValue('6M');
  await page.getByRole('button', { name: 'Edit portfolio holdings & weights' }).click();
  await expect(page.getByRole('dialog')).toContainText('Portfolio settings');
  checks.push({ name: 'Studio Function analysis period and portfolio settings', issues: [] });
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
