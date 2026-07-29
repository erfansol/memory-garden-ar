// AR smoke test with a fake camera (verifies MindAR boot and targets.mind loading)
import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});
const context = await browser.newContext({ permissions: ['camera'] });
const page = await context.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:8642/app.html?scene=7&mode=ar', { waitUntil: 'networkidle' });
await page.click('#start-btn');
await page.waitForTimeout(9000);

const videoActive = await page.evaluate(() => {
  const v = document.querySelector('video');
  return v ? { playing: !v.paused, w: v.videoWidth, h: v.videoHeight } : null;
});
await page.screenshot({ path: 'tools/shots3/ar-smoke.png' });
await browser.close();

console.log('video:', JSON.stringify(videoActive));
if (errors.length) {
  console.log('✗ errors:');
  [...new Set(errors)].slice(0, 6).forEach((e) => console.log('  ', e.slice(0, 300)));
  process.exit(1);
}
console.log('✓ AR mode booted with no errors (fake camera)');
