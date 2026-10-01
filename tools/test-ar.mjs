// Real tracking test: Chrome's fake camera "films" a printed test page, MindAR must
// find the page's Scan Here icon, and the memory must start on top of it.
//   node tools/test-ar.mjs            # scenes 1, 7, 8, 9
//   node tools/test-ar.mjs 7 14       # scene 7, screenshot 14 s after the icon is found
// Needs the local server (python3 -m http.server 8642) and ffmpeg.
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';

const scenes = process.argv[2] ? process.argv[2].split(',') : ['1', '7', '8', '9'];
const after = Number(process.argv[3] || 8);
const OUT = process.env.SHOTS || 'tools/shots';
const CAM = 'tools/shots/cam';
mkdirSync(CAM, { recursive: true });

// a short looping "camera" clip of the page, seen at a slight angle like a hand-held phone
// CROP=w:h:x:y (in ground.jpg pixels) films only part of the page, e.g. one icon of scene 1
function cameraFile(scene) {
  const crop = process.env.CROP ? `crop=${process.env.CROP},` : '';
  const f = `${CAM}/scene${scene}${crop ? '-' + process.env.CROP.replaceAll(':', '_') : ''}.y4m`;
  if (!existsSync(f)) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', `assets/scene${scene}/ground.jpg`,
      '-vf', crop + 'scale=1180:860:force_original_aspect_ratio=decrease,pad=1280:960:(ow-iw)/2:(oh-ih)/2:color=0x5a5046,' +
        'perspective=x0=40:y0=60:x1=1240:y1=60:x2=0:y2=960:x3=1280:y3=960:interpolation=cubic,format=yuv420p',
      '-t', '1', '-r', '5', f]);
  }
  return f;
}

let failed = false;
for (const s of scenes) {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cameraFile(s)}`,
      '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({ permissions: ['camera'], viewport: { width: 960, height: 720 } });
  const page = await context.newPage();
  const found = [];
  const errors = [];
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('AR_TARGET_FOUND')) found.push(t.split(' ')[1]);
    if (m.type() === 'error') errors.push(t);
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:8642/app.html?mode=ar&scene=${s}`, { waitUntil: 'load' });
  await page.click('#start-btn');
  for (let i = 0; i < 40 && !found.length; i++) await page.waitForTimeout(1000);
  if (found.length) await page.waitForTimeout(after * 1000);
  await page.screenshot({ path: `${OUT}/ar-scene${s}${process.env.TAG || ''}.png` });
  const ok = found.length > 0 && !errors.length;
  if (!ok) failed = true;
  console.log(`scene ${s}: ${found.length ? '✓ found ' + [...new Set(found)].join(', ') : '✗ no icon found in 40 s'}` +
    (errors.length ? '  errors: ' + [...new Set(errors)].slice(0, 3).join(' | ') : ''));
  await browser.close();
}
process.exit(failed ? 1 : 0);
