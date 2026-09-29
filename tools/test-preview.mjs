// Automated check of the Preview mode: loads every scene in Chrome, reports errors
// and saves screenshots at chosen moments.
//   node tools/test-preview.mjs                 # all scenes
//   node tools/test-preview.mjs 7 3,9,16        # scene 7 at 3 s, 9 s and 16 s
// Needs the local server:  python3 -m http.server 8642
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const scenes = process.argv[2] ? process.argv[2].split(',') : ['1', '7', '8', '9'];
const times = process.argv[3] ? process.argv[3].split(',').map(Number) : [4, 12];
const OUT = process.env.SHOTS || 'tools/shots';
const EXTRA = process.env.QUERY ? '&' + process.env.QUERY : '';
const TAG = process.env.TAG || '';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--autoplay-policy=no-user-gesture-required', '--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=metal'],
});
let failed = false;
for (const s of scenes) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:8642/app.html?scene=${s}&mode=preview${EXTRA}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('loading').classList.contains('show'), null, { timeout: 60000 });
  const t0 = Date.now();
  for (const t of times) {
    const wait = t * 1000 - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.screenshot({ path: `${OUT}/scene${s}${TAG}-${String(t).padStart(2, '0')}s.png` });
  }
  const caption = await page.$eval('#caption', (el) => el.textContent);
  console.log(`scene ${s}: ${errors.length ? '✗ ' + [...new Set(errors)].slice(0, 4).join(' | ') : '✓ no errors'}  (last caption: "${caption}")`);
  if (errors.length) failed = true;
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
