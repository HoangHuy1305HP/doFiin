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
async function chooseStudioOption(page, label, option) {
  const trigger = page.locator('.studio-left, .studio-right').getByRole('combobox', { name: label, exact: true });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('listbox', { name: label, exact: true }).getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox', { name: label, exact: true })).toHaveCount(0);
  if (await trigger.count()) await expect(trigger).toHaveAttribute('aria-expanded', 'false');
}
async function setup(width, height, signed = true, hasTouch = false) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch });
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
      if (route === 'portfolio') {
        await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Plans' })).toHaveCount(0);
        if (device !== 'mobile') {
          const menuToggle = page.locator('.desktop-menu-toggle');
          await expect(menuToggle).toHaveAttribute('aria-expanded', 'true');
          await menuToggle.click();
          await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
          await expect(page.locator('.sidebar')).toHaveAttribute('inert', '');
          await expect(page.locator('.app-main')).toHaveCSS('margin-left', '0px');
          await menuToggle.click();
          await expect(menuToggle).toHaveAttribute('aria-expanded', 'true');
          await expect(page.locator('.sidebar')).not.toHaveAttribute('inert', '');
        }
      }
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
        await expect(page.locator('.studio-panel-heading strong')).toHaveText('Navigation');
        await expect(page.locator('.studio-panel-heading strong')).toHaveCSS('font-weight', '700');
        const alignment = await page.evaluate(() => ({
          logo: document.querySelector('.studio-header .brand')?.getBoundingClientRect().left,
          arrow: document.querySelector('.studio-group-toggle svg')?.getBoundingClientRect().left,
        }));
        expect(Math.abs(alignment.logo - alignment.arrow)).toBeLessThan(1);
        await expect(page.locator('.studio-panel-heading')).not.toContainText('Portfolio');
        await expect(page.locator('.studio-left .studio-tree-group').first()).toHaveAttribute('aria-label', 'Navigation');
        await expect(page.locator('.studio-left .studio-tree-group').nth(1).getByRole('button', { name: 'Sections', exact: true })).toBeVisible();
        await expect(page.locator('.studio-left')).not.toContainText('Page content');
        await expect(page.getByRole('button', { name: 'Add menu item', exact: true })).toBeVisible();
        await expect(page.locator('.studio-header select')).toHaveCount(0);
        await expect(page.locator('.studio-left select, .studio-right select')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Exit Studio', exact: true })).toHaveCount(0);
        await expect(page.getByRole('combobox', { name: 'Studio page' })).toHaveCount(0);
        await expect(page.getByRole('combobox', { name: 'Content language' })).toBeVisible();
        if (device === 'desktop') {
          for (const size of ['desktop', 'tablet', 'mobile']) {
            await page.getByRole('button', { name: `${size[0].toUpperCase()}${size.slice(1)} preview` }).click();
            await expect(page.locator('.studio-preview')).toHaveAttribute('data-preview-viewport', size);
          }
        } else {
          await expect(page.locator('.viewport-buttons')).toHaveCount(0);
          await expect(page.locator('.studio-preview')).toHaveAttribute('data-preview-viewport', device);
        }
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
        await expect(cards.nth(1)).toHaveCSS('background-color', 'rgb(51, 65, 85)');
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
  await chooseStudioOption(page, 'Content language', '🇻🇳 Tiếng Việt · Việt Nam');
  await page.getByRole('textbox', { name: 'Heading' }).fill('Hiểu rõ danh mục của bạn');
  await page.getByRole('textbox', { name: 'Description' }).fill('Nội dung tiếng Việt dành riêng cho trang này.');
  await expect(page.locator('.studio-preview-heading h2')).toHaveText('Hiểu rõ danh mục của bạn');
  for (const size of ['desktop', 'tablet', 'mobile']) {
    await page.getByRole('button', { name: `${size[0].toUpperCase()}${size.slice(1)} preview` }).click();
    await expect(page.locator('.studio-preview-heading h2')).toHaveText('Hiểu rõ danh mục của bạn');
  }
  for (const [width, expected] of [[834, 'tablet'], [390, 'mobile']]) {
    await page.setViewportSize({ width, height: 1024 });
    await expect(page.locator('.viewport-buttons')).toHaveCount(0);
    await expect(page.locator('.studio-preview')).toHaveAttribute('data-preview-viewport', expected);
    await expect(page.locator('.studio-preview-heading h2')).toHaveText('Hiểu rõ danh mục của bạn');
  }
  await page.setViewportSize({ width: 1440, height: 1024 });
  await expect(page.locator('.viewport-buttons button')).toHaveCount(3);
  await page.getByRole('button', { name: 'Edit Risk menu item' }).click();
  await page.getByRole('button', { name: 'Remove from menu', exact: true }).click();
  await page.getByRole('button', { name: 'Add menu item', exact: true }).click();
  await chooseStudioOption(page, 'Add navigation menu', 'Risk');
  await page.getByRole('tab', { name: 'Design', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show legend' }).uncheck();
  await chooseStudioOption(page, 'Corner radius', '8 px');
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
  await page.locator('.studio-left .studio-tree-select').filter({ hasText: 'Risk' }).click();
  await expect(page).toHaveURL(BASE + '/risk');
  await expect(page.locator('.studio-preview-path')).toContainText('Risk');
  await expect(page.locator('.studio-preview-heading .eyebrow')).toContainText('RISK');
  await expect(page.getByRole('textbox', { name: 'Heading' })).toHaveValue('Risk, from every angle.');
  await page.locator('.studio-left .studio-tree-select').filter({ hasText: 'Portfolio' }).click();
  await expect(page).toHaveURL(BASE + '/portfolio');
  await expect(page.locator('.studio-preview-path')).toContainText('Portfolio');
  checks.push({ name: 'Studio Navigation opens the selected page editor', issues: [] });
  await page.locator('.studio-left .studio-tree-select').filter({ hasText: 'Risk' }).click();
  await expect(page).toHaveURL(BASE + '/risk');
  await expect(page.locator('.studio-preview-path')).toContainText('Risk');
  await page.locator('.studio-left .studio-tree-select').filter({ hasText: 'Relationships between assets' }).click();
  await expect(page.locator('.studio-inspector-heading')).toContainText('Relationships between assets');
  await page.getByRole('button', { name: 'Close Studio', exact: true }).click();
  checks.push({ name: 'Studio Navigation and contextual widget inspector', issues: [] });
  await page.goto(BASE + '/portfolio', { waitUntil: 'networkidle' });
  await page.getByRole('switch', { name: 'Studio mode' }).click();
  await page.getByRole('tab', { name: 'Function', exact: true }).click();
  await chooseStudioOption(page, 'Studio analysis period', '6M');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('.studio-shell')).toHaveCount(0);
  await expect(page.locator('.page-intro .eyebrow')).toContainText('6M');
  await expect(page.locator('.widgets-grid')).toBeVisible();
  await page.getByRole('switch', { name: 'Studio mode' }).click();
  await page.getByRole('tab', { name: 'Function', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Studio analysis period' })).toHaveAttribute('data-value', '6M');
  await page.getByRole('button', { name: 'Edit portfolio holdings & weights' }).click();
  await expect(page.getByRole('dialog')).toContainText('Portfolio settings');
  checks.push({ name: 'Studio Function analysis period and portfolio settings', issues: [] });
  await context.close();

  const selectContext = await setup(1440, 1024);
  const selectPage = await selectContext.newPage();
  await selectPage.goto(BASE + '/backtest', { waitUntil: 'networkidle' });
  await selectPage.getByRole('switch', { name: 'Studio mode' }).click();
  await chooseStudioOption(selectPage, 'Content language', '🇻🇳 Tiếng Việt · Việt Nam');
  await selectPage.getByRole('tab', { name: 'Design', exact: true }).click();
  await chooseStudioOption(selectPage, 'Chart type', 'Line');
  await chooseStudioOption(selectPage, 'Density', 'Compact');
  const radiusTrigger = selectPage.getByRole('combobox', { name: 'Corner radius' });
  await radiusTrigger.click();
  await expect(selectPage.getByRole('listbox', { name: 'Corner radius' })).toBeVisible();
  await selectPage.getByRole('option', { name: '0 px' }).press('Escape');
  await expect(radiusTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(selectPage.locator('.studio-shell')).toBeVisible();
  await radiusTrigger.press('ArrowDown');
  await expect(selectPage.getByRole('option', { name: '0 px' })).toBeFocused();
  await selectPage.getByRole('option', { name: '0 px' }).press('ArrowDown');
  await expect(selectPage.getByRole('option', { name: '4 px' })).toBeFocused();
  await selectPage.getByRole('option', { name: '4 px' }).press('Enter');
  await expect(radiusTrigger).toHaveAttribute('data-value', '4');
  await chooseStudioOption(selectPage, 'Corner radius', '12 px');
  await selectPage.getByRole('tab', { name: 'Function', exact: true }).click();
  await chooseStudioOption(selectPage, 'Studio analysis period', '3M');
  await chooseStudioOption(selectPage, 'Studio data source', 'Yahoo Finance');
  await chooseStudioOption(selectPage, 'Strategy', 'Buy and hold');
  await chooseStudioOption(selectPage, 'Rebalance', 'None');
  await expect(selectPage.locator('.studio-left select, .studio-right select')).toHaveCount(0);
  await expect(selectPage.locator('.studio-right').getByRole('combobox', { name: 'Rebalance' })).toHaveAttribute('data-value', 'NONE');
  await selectPage.getByRole('button', { name: 'Theme settings' }).click();
  await expect(selectPage.getByRole('tab', { name: 'Design' })).toHaveAttribute('aria-selected', 'true');
  await chooseStudioOption(selectPage, 'Chart type', 'Area');
  await chooseStudioOption(selectPage, 'Corner radius', '0 px');
  checks.push({ name: 'Studio custom dropdowns across Content, Design, Function and backtest rules', issues: [] });
  await selectContext.close();

  const reorderContext = await setup(1440, 1024);
  const reorderPage = await reorderContext.newPage();
  await reorderPage.goto(BASE + '/portfolio', { waitUntil: 'networkidle' });
  await reorderPage.getByRole('switch', { name: 'Studio mode' }).click();
  const navigationToggle = reorderPage.getByRole('button', { name: 'Navigation' });
  const sectionsToggle = reorderPage.getByRole('button', { name: 'Sections', exact: true });
  for (const [toggle, list] of [
    [navigationToggle, reorderPage.locator('#studio-navigation-list')],
    [sectionsToggle, reorderPage.locator('#studio-sections-list')],
  ]) {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(list).toHaveAttribute('aria-hidden', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(list).toHaveAttribute('aria-hidden', 'false');
  }
  const menuRows = reorderPage.locator('[data-reorder-kind="menu"]');
  async function dragHandle(from, to) {
    const handle = await from.locator('.studio-drag-handle').boundingBox();
    const target = await to.boundingBox();
    await reorderPage.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await reorderPage.mouse.down();
    await reorderPage.mouse.move(handle.x + handle.width / 2, handle.y - 12, { steps: 5 });
    await reorderPage.mouse.move(target.x + target.width / 2, target.y + target.height * .75, { steps: 16 });
    await expect(to).toHaveClass(/drop-after/);
    await reorderPage.mouse.up();
  }
  await dragHandle(menuRows.last(), menuRows.first());
  await expect(menuRows.nth(1)).toHaveAttribute('data-reorder-key', 'factors');
  const widgetRows = reorderPage.locator('[data-reorder-kind="widget"]');
  const lastWidget = await widgetRows.last().getAttribute('data-reorder-key');
  await dragHandle(widgetRows.last(), widgetRows.first());
  await expect(widgetRows.nth(1)).toHaveAttribute('data-reorder-key', lastWidget);
  await expect(reorderPage.locator('.studio-header-status')).toHaveText('Unsaved changes');
  checks.push({ name: 'Studio Navigation and Sections accordion and drag reorder', issues: [] });
  await reorderPage.getByRole('button', { name: 'Add sections' }).click();
  await expect(reorderPage.locator('#studio-section-picker')).toContainText('All available sections are already on this page.');
  await reorderPage.getByRole('button', { name: 'Add sections' }).click();
  await widgetRows.first().getByRole('button', { name: 'Cumulative growth', exact: true }).click();
  await reorderPage.getByRole('tab', { name: 'Design', exact: true }).click();
  await reorderPage.getByRole('button', { name: 'Remove section', exact: true }).click();
  await expect(widgetRows).toHaveCount(3);
  await expect(reorderPage.locator('.studio-preview .widget-growth')).toHaveCount(0);
  await reorderPage.getByRole('button', { name: 'Add sections' }).click();
  await reorderPage.locator('#studio-section-picker').getByRole('button', { name: 'Cumulative growth' }).click();
  await expect(widgetRows).toHaveCount(4);
  await expect(reorderPage.locator('.studio-preview .widget-growth')).toBeVisible();
  checks.push({ name: 'Studio remove and add existing section', issues: [] });
  await reorderContext.close();

  const focusContext = await setup(1440, 1024);
  const focusPage = await focusContext.newPage();
  for (const route of analytics) {
    await focusPage.goto(BASE + '/' + route, { waitUntil: 'networkidle' });
    await focusPage.getByRole('switch', { name: 'Studio mode' }).click();
    const rows = focusPage.locator('[data-reorder-kind="widget"]');
    const keys = await rows.evaluateAll((elements) => elements.map((element) => element.dataset.reorderKey));
    for (const key of keys) {
      await focusPage.locator(`[data-reorder-kind="widget"][data-reorder-key="${key}"] .studio-tree-select`).click();
      const target = focusPage.locator(`.studio-preview [data-studio-section="${key}"]`);
      await expect(target).toHaveClass(/studio-section-selected/);
      await expect(focusPage.locator('.studio-preview .studio-section-selected')).toHaveCount(1);
      await expect.poll(() => target.evaluate((element) => {
        const stage = element.closest('.studio-preview-stage');
        if (!stage) return false;
        const section = element.getBoundingClientRect();
        const viewport = stage.getBoundingClientRect();
        return section.bottom > viewport.top + 24 && section.top < viewport.bottom - 24;
      })).toBe(true);
    }
    if (route === 'portfolio') {
      await focusPage.locator(`[data-reorder-kind="widget"][data-reorder-key="${keys[0]}"] .studio-tree-select`).click();
      const flash = focusPage.locator(`.studio-preview [data-studio-section="${keys[0]}"]`);
      await expect(flash).toHaveCSS('outline-color', 'rgb(0, 0, 0)');
      await expect(flash).not.toHaveClass(/studio-section-selected/, { timeout: 1500 });
    }
    await focusPage.getByRole('button', { name: 'Close Studio', exact: true }).click();
  }
  checks.push({ name: 'Studio section focus and preview highlight on every analytics page', issues: [] });
  for (const width of [834, 390]) {
    await focusPage.setViewportSize({ width, height: 844 });
    await focusPage.goto(BASE + '/portfolio', { waitUntil: 'networkidle' });
    await focusPage.getByRole('switch', { name: 'Studio mode' }).click();
    const lastRow = focusPage.locator('[data-reorder-kind="widget"]').last();
    const key = await lastRow.getAttribute('data-reorder-key');
    await lastRow.locator('.studio-tree-select').click();
    await expect(focusPage.locator(`.studio-preview [data-studio-section="${key}"]`))
      .toHaveClass(/studio-section-selected/);
    await expect.poll(() => focusPage.locator('.studio-body').evaluate((element) => element.scrollTop))
      .toBeLessThan(5);
    await focusPage.getByRole('switch', { name: 'Studio mode' }).click();
  }
  checks.push({ name: 'Studio section focus returns to preview on tablet and mobile', issues: [] });
  await focusContext.close();

  const touchContext = await setup(834, 1194, true, true);
  const touchPage = await touchContext.newPage();
  await touchPage.goto(BASE + '/portfolio', { waitUntil: 'networkidle' });
  await touchPage.getByRole('switch', { name: 'Studio mode' }).click();
  const touchRows = touchPage.locator('[data-reorder-kind="widget"]');
  const touchSource = touchRows.last().locator('.studio-drag-handle');
  await touchSource.scrollIntoViewIfNeeded();
  const sourceBox = await touchSource.boundingBox();
  const targetBox = await touchRows.first().boundingBox();
  const touchSession = await touchContext.newCDPSession(touchPage);
  const touchPoint = (x, y) => [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }];
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height * .75;
  const movedWidget = await touchRows.last().getAttribute('data-reorder-key');
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoint(startX, startY) });
  for (let step = 1; step <= 12; step++) {
    const progress = step / 12;
    await touchSession.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: touchPoint(startX + (endX - startX) * progress, startY + (endY - startY) * progress),
    });
    await touchPage.waitForTimeout(10);
  }
  await expect(touchRows.first()).toHaveClass(/drop-after/);
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(touchRows.nth(1)).toHaveAttribute('data-reorder-key', movedWidget);
  checks.push({ name: 'Studio Sections touch drag on tablet', issues: [] });
  await touchContext.close();
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
