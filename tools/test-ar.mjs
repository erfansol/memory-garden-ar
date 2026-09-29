// Quick AR check: Chrome's fake camera shows a photo of the printed book (the test pages
// in assets/testpages), and the scene's memory must lock onto it and stay.
//   node tools/test-ar.mjs            # scenes 1, 7, 8, 9
//   node tools/test-ar.mjs 7 14       # scene 7, screenshot 14 s after it locks
// Needs the local server (python3 -m http.server 8642) and ffmpeg.
// For a thorough check on every photo see tools/targets/eval_photos.mjs.
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const scenes = process.argv[2] ? process.argv[2].split(',') : ['1', '7', '8', '9'];
const after = Number(process.argv[3] || 6);
const OUT = process.env.SHOTS || 'tools/shots';
mkdirSync(OUT, { recursive: true });

let failed = false;
for (const s of scenes) {
  // a phone camera delivers 640x480
  const y4m = join(tmpdir(), `mg-test-ar-${s}.y4m`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', `assets/testpages/scene${s}.jpg`,
    '-vf', 'scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2,format=yuv420p', '-t', '1', '-r', '6', y4m]);
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`,
      '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await (await browser.newContext({ permissions: ['camera'], viewport: { width: 800, height: 600 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // ALL=1: "Scan the Book" (every scene at once) instead of the scene's own targets
  await page.goto(`http://localhost:8642/app.html?mode=ar${process.env.ALL ? "" : `&scene=${s}`}`, { waitUntil: "load" });
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__mg && window.__mg.started, null, { timeout: 60000 });
  let lock = null;
  const t0 = Date.now();
  while (!lock && Date.now() - t0 < 20000) {
    const st = await page.evaluate(() => window.__mg.status());
    if (st.tracked) lock = { t: (Date.now() - t0) / 1000, id: st.id };
    else await page.waitForTimeout(200);
  }
  let held = 0, n = 0;
  if (lock) {
    const t1 = Date.now();
    while (Date.now() - t1 < after * 1000) {
      const st = await page.evaluate(() => window.__mg.status());
      n++; if (st.tracked) held++;
      await page.waitForTimeout(200);
    }
  }
  await page.screenshot({ path: `${OUT}/ar-scene${s}.png` });
  const ok = !!lock && held / Math.max(1, n) > 0.9 && !errors.length;
  if (!ok) failed = true;
  console.log(`scene ${s}: ` + (lock ? `✓ locked on ${lock.id} after ${lock.t.toFixed(1)}s, held ${((held / Math.max(1, n)) * 100).toFixed(0)}%` : '✗ no lock in 20 s') +
    (errors.length ? '  errors: ' + errors.slice(0, 2).join(' | ') : ''));
  await browser.close();
}
process.exit(failed ? 1 : 0);
