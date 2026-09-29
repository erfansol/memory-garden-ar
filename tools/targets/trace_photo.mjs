// Pose trace on one still photo: node tools/targets/trace_photo.mjs <photo> <scene> [seconds]
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
const [photo, scene, secs = 8] = process.argv.slice(2);
const y = join(tmpdir(), 'mg-trace.y4m');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', photo, '-vf', 'scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2,format=yuv420p', '-t', '1', '-r', '6', y]);
const b = await chromium.launch({ channel: 'chrome', args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y}`, '--use-fake-ui-for-media-stream'] });
const p = await (await b.newContext({ permissions: ['camera'], viewport: { width: 800, height: 600 } })).newPage();
await p.goto(`http://localhost:8642/app.html?mode=ar&scene=${scene}`);
await p.click('#start-btn');
await p.waitForFunction(() => window.__mg && window.__mg.started, null, { timeout: 60000 });
const rows = [];
const t0 = Date.now();
while (Date.now() - t0 < secs * 1000) {
  const r = await p.evaluate(() => {
    const st = window.__mg.status();
    const raw = Object.values(window.__mg.scenes).flatMap((sc) => sc.slots.filter((s) => s.anchor.group.visible).map((s) => s.target.id));
    return { ...st, raw };
  });
  rows.push(`${((Date.now() - t0) / 1000).toFixed(1)} ${r.tracked ? r.id : '-'} ${r.sx ? r.sx.toFixed(0) + ',' + r.sy.toFixed(0) : ''} raw=[${r.raw}]`);
  await p.waitForTimeout(150);
}
console.log(rows.join('\n'));
await b.close();
