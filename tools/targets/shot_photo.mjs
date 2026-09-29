// AR screenshot with one real photo as the camera:  node tools/targets/shot_photo.mjs <photo> <scene> <seconds> <out.png>
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
const [photo, scene, secs, out] = process.argv.slice(2);
const y = join(tmpdir(), 'mg-shot.y4m');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', photo, '-vf', 'scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2,format=yuv420p', '-t', '1', '-r', '6', y]);
const b = await chromium.launch({ channel: 'chrome', args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y}`, '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const p = await (await b.newContext({ permissions: ['camera'], viewport: { width: 800, height: 600 } })).newPage();
await p.goto(`http://localhost:8642/app.html?mode=ar&scene=${scene}`);
await p.click('#start-btn');
await p.waitForFunction(() => window.__mg && window.__mg.started, null, { timeout: 60000 });
await p.waitForTimeout(+secs * 1000);
const st = await p.evaluate(() => window.__mg.status());
await p.screenshot({ path: out });
console.log(JSON.stringify(st));
await b.close();
