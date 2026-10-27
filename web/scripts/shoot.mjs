// Screenshot every app screen through a mocked API. Output: .verify/shots/*.png
// Usage: bun scripts/shoot.mjs [--out=dir] [--width=1440] [--height=1024] [--dpr=2] [--pages=a,b]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { handleApi } from './fixtures.mjs';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=')[1] : fallback;
};
const OUT = arg('out', '.verify/shots');
const WIDTH = Number(arg('width', 1440));
const HEIGHT = Number(arg('height', 1024));
const DPR = Number(arg('dpr', 2));
const ONLY = arg('pages', '').split(',').filter(Boolean);
const BASE = arg('base', 'http://127.0.0.1:5173');

mkdirSync(OUT, { recursive: true });

const routeApi = (page, allowRefresh) =>
  page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    if (path === '/auth/refresh' && !allowRefresh)
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"error":{"code":"INVALID_REFRESH","message":"expired"}}',
      });
    let body;
    try {
      body = route.request().postDataJSON();
    } catch {
      body = null;
    }
    const res = handleApi(path, route.request().method(), body);
    if (res.status === 204) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({
      status: res.status,
      contentType: 'application/json',
      body: res.body,
      headers: { 'access-control-allow-origin': '*' },
    });
  });

const browser = await chromium.launch();
const results = [];

async function shoot(
  name,
  { width = WIDTH, height = HEIGHT, auth = false, setup, fullPage = true } = {},
) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: DPR,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  });
  const page = await context.newPage();
  routeApi(page, !auth);
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  await page.goto(BASE + '/sign-in', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (setup) await setup(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  results.push({ name, errors: errors.filter((e) => !/favicon|net::ERR/.test(e)) });
  await context.close();
}

const signIn = async (page) => {
  if (await page.locator('.app-shell').count()) return;
  await page.getByRole('button', { name: /Explore demo/ }).click();
  await page.waitForSelector('.app-shell', { timeout: 15000 });
  await page.waitForSelector('.widget', { timeout: 15000 });
  await page.waitForTimeout(700);
};

// Auth screens (refresh must fail so the login form shows)
await shoot('auth-login', { auth: true });
await shoot('auth-register', {
  auth: true,
  setup: (page) => page.getByRole('button', { name: /Sign up free/ }).click(),
});

// Signed-in pages at design width
const pages = [
  ['page-portfolio', 'portfolio'],
  ['page-risk', 'risk'],
  ['page-signals', 'signals'],
  ['page-backtest', 'backtest'],
  ['page-factors', 'factors'],
  ['page-subscription', 'subscription'],
  ['page-account', 'account'],
];
for (const [name, path] of pages) {
  await shoot(name, {
    setup: async (page) => {
      await signIn(page);
      await page.goto(BASE + '/' + path);
      await page.waitForSelector(
        path === 'subscription'
          ? '.plans-grid'
          : path === 'account'
            ? '.account-grid'
            : '.widgets-grid',
        {
          timeout: 15000,
        },
      );
      await page.waitForTimeout(900);
    },
  });
}

// Dialogs + studio
await shoot('dialog-create', {
  setup: async (page) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Manage portfolios' }).click();
    await page.getByRole('button', { name: 'Create portfolio' }).click();
    await page.waitForSelector('.modal');
  },
});
await shoot('dialog-help', {
  setup: async (page) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Help' }).click();
    await page.waitForSelector('.modal');
  },
});
await shoot('studio', {
  setup: async (page) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Open Studio', exact: true }).click();
    await page.waitForSelector('.studio-shell', { timeout: 15000 });
    await page.waitForTimeout(600);
  },
});

// Breakdown sweep: key pages at tablet/mobile widths
for (const width of [1250, 1020, 760, 430, 360]) {
  for (const [name, path] of [
    ['page-portfolio', 'portfolio'],
    ['page-subscription', 'subscription'],
  ]) {
    await shoot(`${name}-w${width}`, {
      width,
      height: width <= 760 ? 900 : HEIGHT,
      setup: async (page) => {
        await signIn(page);
        await page.goto(BASE + '/' + path);
        await page.waitForSelector(
          path === 'subscription'
            ? '.plans-grid'
            : path === 'account'
              ? '.account-grid'
              : '.widgets-grid',
          {
            timeout: 15000,
          },
        );
        await page.waitForTimeout(900);
      },
    });
  }
  await shoot(`auth-login-w${width}`, { width, height: 900, auth: true });
}

await browser.close();
const bad = results.filter((r) => r.errors.length);
console.log(JSON.stringify({ out: OUT, shots: results.length, withErrors: bad }, null, 2));
