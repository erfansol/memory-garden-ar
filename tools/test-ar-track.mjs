// Real tracking test: a video of the printed page acts as the fake camera
import { chromium } from 'playwright';

const VID = process.argv[2];
const browser = await chromium.launch({
  args: [
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${VID}`,
    '--use-fake-ui-for-media-stream',
  ],
});
const context = await browser.newContext({ permissions: ['camera'] });
const page = await context.newPage();

let found = false;
const errors = [];
page.on('console', (m) => {
  if (m.text().includes('AR_TARGET_FOUND')) found = true;
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:8642/app.html?scene=7&mode=ar', { waitUntil: 'networkidle' });
await page.click('#start-btn');
for (let i = 0; i < 20 && !found; i++) await page.waitForTimeout(1000);
await page.screenshot({ path: 'tools/shots3/ar-track.png' });
await browser.close();

if (errors.length) console.log('errors:', [...new Set(errors)].slice(0, 3).join(' | ').slice(0, 400));
console.log(found ? '✓✓ target found — AR tracking works!' : '✗ target not found within 20 seconds');
process.exit(found ? 0 : 1);
