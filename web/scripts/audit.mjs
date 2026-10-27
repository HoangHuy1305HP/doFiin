// Layout/typography audit without design reference: catches breakdown, font
// fallback, overflow, and clipped elements across breakpoints.
// Usage: bun scripts/audit.mjs [--base=http://127.0.0.1:5173] [--json]
import { chromium } from 'playwright';
import { handleApi } from './fixtures.mjs';

const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith('--' + n + '='));
  return h ? h.split('=')[1] : d;
};
const BASE = arg('base', 'http://127.0.0.1:5173');
const JSON_OUT = process.argv.includes('--json');

const routeApi = (page, allowRefresh) =>
  page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, '');
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
    return route.fulfill({ status: res.status, contentType: 'application/json', body: res.body });
  });

const AUDIT = async () => {
  const issues = [];
  const doc = document.scrollingElement;
  // 1. Horizontal page overflow
  if (doc.scrollWidth > window.innerWidth + 1)
    issues.push(`overflow-x: page ${doc.scrollWidth}px > viewport ${window.innerWidth}px`);
  // 2. Fonts: force-load every face used by the app, then verify
  const faces = [
    ['Space Grotesk', ['400', '700']],
    ['Geist', ['400', '700']],
  ];
  for (const [fam, ws] of faces)
    for (const w of ws) {
      try {
        await document.fonts.load(`${w} 16px "${fam}"`);
      } catch {
        issues.push(`font: ${fam} ${w} load rejected`);
      }
      if (!document.fonts.check(`${w} 16px "${fam}"`)) issues.push(`font: ${fam} ${w} missing`);
    }
  // 3. Any text node falling back outside the two families (rendered families)
  const bad = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const hasText = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
    );
    if (!hasText) continue;
    const fam = cs.fontFamily;
    if (!/Space Grotesk|Geist/.test(fam)) bad.add(`${el.tagName}.${el.className} → ${fam}`);
  }
  for (const b of bad) issues.push('font-family unexpected: ' + b);
  // 4. Elements clipped horizontally inside their scroll container
  const clipped = [];
  for (const el of document.querySelectorAll('main *, header *, aside *')) {
    if (!(el instanceof HTMLElement)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX === 'visible' && el.clientWidth > 0)
      clipped.push(
        `${el.tagName}.${String(el.className).slice(0, 40)} ${el.scrollWidth}>${el.clientWidth}`,
      );
  }
  for (const c of clipped.slice(0, 8)) issues.push('clipped: ' + c);
  // 5. Zero-size visible interactive elements
  const flat = [];
  for (const el of document.querySelectorAll('button, a, input, select')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })) continue;
    if (r.width === 0 || r.height === 0) {
      const label =
        el.getAttribute('aria-label') || el.textContent.trim().slice(0, 25) || '(no text)';
      const cls = String(el.className).slice(0, 50);
      flat.push(`${el.tagName}.${cls} "${label}"`);
    }
  }
  for (const f of flat.slice(0, 8)) issues.push('zero-size control: ' + f);
  // 6. Key siblings overlapping (sidebar vs main, bottom nav vs footer)
  const sidebar = document.querySelector('.sidebar');
  const main = document.querySelector('.app-main');
  if (sidebar && main) {
    const a = sidebar.getBoundingClientRect();
    const b = main.getBoundingClientRect();
    if (a.right > b.left + 1 && getComputedStyle(sidebar).position !== 'fixed')
      issues.push(`overlap: sidebar ${a.right.toFixed(0)} > main-left ${b.left.toFixed(0)}`);
  }
  // 7. Base typography tokens
  const root = getComputedStyle(document.documentElement);
  if (root.fontSize !== '16px') issues.push(`root font-size ${root.fontSize} (expected 16px)`);
  const h1 = document.querySelector('h1');
  if (h1) {
    const cs = getComputedStyle(h1);
    if (!cs.fontFamily.includes('Space Grotesk')) issues.push(`h1 family ${cs.fontFamily}`);
  }
  return issues;
};

const browser = await chromium.launch();
const PAGES = [
  ['portfolio', 'portfolio'],
  ['risk', 'risk'],
  ['signals', 'signals'],
  ['backtest', 'backtest'],
  ['factors', 'factors'],
  ['subscription', 'subscription'],
];
const WIDTHS = [1550, 1440, 1250, 1020, 760, 430, 360];
const out = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1024 },
  deviceScaleFactor: 2,
  locale: 'vi-VN',
});
const page = await context.newPage();
routeApi(page, true);
await page.goto(BASE + '/sign-in', { waitUntil: 'networkidle' });
await page
  .getByRole('button', { name: /Explore demo/ })
  .click()
  .catch(() => {});
await page.waitForSelector('.app-shell, .widget', { timeout: 15000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);

for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: width <= 760 ? 860 : 1024 });
  await page.waitForTimeout(300);
  for (const [name, path] of PAGES) {
    await page.goto(BASE + '/' + path);
    await page
      .waitForSelector(path === 'subscription' ? '.plans-grid' : '.widgets-grid', {
        timeout: 15000,
      })
      .catch(() => {});
    await page.waitForTimeout(250);
    const issues = await page.evaluate(AUDIT);
    if (issues.length) out.push({ width, page: name, issues });
  }
  // auth page too
  await page.evaluate(() => fetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {}));
  await context.clearCookies();
  const issues2 = await page.evaluate(AUDIT);
  if (issues2.length) out.push({ width, page: 'current-state', issues: issues2 });
}
await browser.close();
if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
else if (!out.length) console.log('AUDIT CLEAN ✓');
else for (const r of out) for (const i of r.issues) console.log(`w${r.width} ${r.page}: ${i}`);
