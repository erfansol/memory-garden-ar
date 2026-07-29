// Headless test of all 4 preview scenes: console errors + screenshots
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = process.env.SHOT_DIR || 'tools/shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });

let failures = 0;
for (const s of ['1', '7', '8', '9']) {
  const errors = [];
  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`http://localhost:8642/app.html?scene=${s}&mode=preview`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/scene${s}-a.png` });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/scene${s}-b.png` });

  if (errors.length) {
    failures++;
    console.log(`✗ scene ${s}:`);
    [...new Set(errors)].slice(0, 5).forEach((e) => console.log('   ', e.slice(0, 300)));
  } else {
    console.log(`✓ scene ${s} — no errors`);
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
