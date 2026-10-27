// Pixel-diff app screenshots against Figma exports in ../design/.
// Usage: bun scripts/diff.mjs [--shots=.verify/shots] [--design=../design] [--threshold=0.12] [--alpha=0.35] [--json]
// Match rule: shot "<app>-w<width>.png" vs design "<frame>.png"; frame width from PNG dims decides app viewport scale.
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith('--' + n + '='));
  return h ? h.split('=')[1] : d;
};
const SHOTS = arg('shots', '.verify/shots');
const DESIGN = arg('design', '../design');
const THRESHOLD = Number(arg('threshold', 0.12));
const ALPHA = Number(arg('alpha', 0.35));
const JSON_OUT = process.argv.includes('--json');
const DIFFS = `${SHOTS}/../diffs`;
mkdirSync(DIFFS, { recursive: true });

const load = (p) => PNG.sync.read(readFileSync(p));
const px = (img, x, y) => {
  const i = (img.width * y + x) << 2;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

const designs = readdirSync(DESIGN).filter((f) => /\.png$/i.test(f) && !f.startsWith('.'));
const report = [];
const norm = (s) =>
  s
    .replace(/\.png$/i, '')
    .replace(/@\d+(\.\d+)?x$/i, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const allShots = readdirSync(SHOTS).filter((f) => f.endsWith('.png')).map((f) => ({ f, n: norm(f) }));
const SYNONYMS = [
  [/sign-?in|login|dang-?nhap/, 'auth-login'],
  [/register|sign-?up|dang-?ky/, 'auth-register'],
  [/portfolio|danh-?muc/, 'page-portfolio'],
  [/risk|rui-?ro/, 'page-risk'],
  [/signal|tin-?hieu/, 'page-signals'],
  [/backtest|kiem-?thu/, 'page-backtest'],
  [/factor|yeu-?to/, 'page-factors'],
  [/subscription|plan|goi|dich-?vu/, 'page-subscription'],
  [/studio/, 'studio'],
  [/create|tao-danh-muc|new/, 'dialog-create'],
  [/help|huong-?dan/, 'dialog-help'],
];
const mobile = (n) => /mobile|dien-?thoai/.test(n);
const tablet = (n) => /tablet|may-?tinh-?bang|ipad/.test(n);
for (const file of designs) {
  const designPath = `${DESIGN}/${file}`;
  const base = norm(file);
  let shotFile = allShots.find((s) => s.n === base)?.f;
  if (!shotFile)
    for (const [re, target] of SYNONYMS)
      if (re.test(base)) {
        shotFile = allShots.find((s) => s.n === target || s.n.startsWith(target + '-w'))?.f;
        if (shotFile) break;
      }
  if (!shotFile) {
    report.push({ frame: file, matched: null, note: 'no matching shot' });
    continue;
  }
  const A = load(designPath); // design
  const B = load(`${SHOTS}/${shotFile}`); // app
  // Normalize sizes: scale app shot to design width (keep design as truth)
  let app = B;
  if (B.width !== A.width) {
    const scale = A.width / B.width;
    const w = A.width;
    const h = Math.round(B.height * scale);
    const scaled = new PNG({ width: w, height: h });
    // nearest-neighbor downscale/upscale
    for (let y = 0; y < h; y++) {
      const sy = Math.min(B.height - 1, Math.round(y / scale));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(B.width - 1, Math.round(x / scale));
        const di = (w * y + x) << 2;
        const si = (B.width * sy + sx) << 2;
        scaled.data[di] = B.data[si];
        scaled.data[di + 1] = B.data[si + 1];
        scaled.data[di + 2] = B.data[si + 2];
        scaled.data[di + 3] = 255;
      }
    }
    app = scaled;
  }
  const height = Math.max(A.height, app.height);
  const a = new PNG({ width: A.width, height });
  const b = new PNG({ width: A.width, height });
  PNG.bitblt(A, a, 0, 0, A.width, A.height, 0, 0);
  PNG.bitblt(app, b, 0, 0, app.width, app.height, 0, 0);
  const diff = new PNG({ width: A.width, height });
  const changed = pixelmatch(a.data, b.data, diff.data, A.width, height, {
    threshold: THRESHOLD,
    alpha: ALPHA,
    includeAA: false,
  });
  const total = A.width * height;
  const pct = ((changed / total) * 100).toFixed(2);
  const out = `${DIFFS}/${base}.diff.png`;
  writeFileSync(out, PNG.sync.write(diff));
  report.push({
    shot: shotFile,
    designSize: [A.width, A.height],
    appSize: [B.width, B.height],
    changedPx: changed,
    changedPct: Number(pct),
  });
}
report.sort((x, y) => y.changedPct - x.changedPct);
if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
else
  for (const r of report)
    console.log(
      r.matched === null
        ? `?? ${r.frame}: ${r.note}`
        : `${r.changedPct > 5 ? '✗' : r.changedPct > 1 ? '~' : '✓'} ${r.frame} vs ${r.shot}: ${r.changedPct}% changed (${r.changedPx}px) [design ${r.designSize.join('x')} / app ${r.appSize.join('x')}]`,
    );
