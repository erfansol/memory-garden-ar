// Measures tracking on real photos of the printed book.
// Each scene's photos are played to Chrome's fake camera as a slideshow (SECS per photo);
// the app runs in AR mode and we sample, several times per second, whether a target of
// that scene is tracked. Reports per photo: found / how fast / how stable.
//
//   node tools/targets/eval_photos.mjs <photos dir> <scene> [label]
// Needs the local server (python3 -m http.server 8642) and ffmpeg.
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import { mkdirSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const [dir, scene, label = 'run'] = process.argv.slice(2);
const SECS = Number(process.env.SECS || 5);
const OUT = 'tools/shots/eval';
mkdirSync(OUT, { recursive: true });

// photos that became targets are left out, so every result is on an unseen view
const used = new Set(JSON.parse(readFileSync('targets/targets.json', 'utf8')).filter((t) => t.from).map((t) => t.from + '.jpg'));
const [RW, RH] = (process.env.RES || '640x480').split('x').map(Number);   // what a phone camera delivers
const photos = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f) && !used.has(f))
  .sort((a, b) => (parseInt(a.match(/\((\d+)\)/)?.[1] || 0)) - (parseInt(b.match(/\((\d+)\)/)?.[1] || 0)));
// the raw camera clip is large: keep it on the internal disk
const y4m = join(tmpdir(), `mg-eval-scene${scene}.y4m`);
// slideshow: every photo letterboxed into 1280x960 for SECS seconds
const inputs = photos.flatMap((p) => ['-loop', '1', '-t', String(SECS), '-i', join(dir, p)]);
const chain = photos.map((_, i) => `[${i}:v]scale=${RW}:${RH}:force_original_aspect_ratio=decrease,pad=${RW}:${RH}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=6[v${i}]`).join(';');
const concat = photos.map((_, i) => `[v${i}]`).join('') + `concat=n=${photos.length}:v=1:a=0,format=yuv420p[out]`;
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `${chain};${concat}`, '-map', '[out]', y4m]);

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`,
    '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const page = await (await browser.newContext({ permissions: ['camera'], viewport: { width: 960, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:8642/app.html?mode=ar&scene=${scene}`, { waitUntil: 'load' });
await page.click('#start-btn');
await page.waitForFunction(() => window.__mg && window.__mg.started, null, { timeout: 60000 });
// Chrome loops the fake camera file; sample one full pass, aligned to its start
const samples = [];
const t0 = Date.now();
const total = photos.length * SECS * 1000;
while (Date.now() - t0 < total + 1500) {
  const s = await page.evaluate(() => window.__mg.status());
  samples.push({ t: (Date.now() - t0) / 1000, ...s });
  await page.waitForTimeout(100);
}
await browser.close();
try { (await import('fs')).unlinkSync(y4m); } catch (e) { /* ignore */ }

// the camera clock starts when the stream opens; estimate its offset from the page's own report
const offset = samples.length ? samples[0].camT - samples[0].t : 0;
const rows = photos.map((p, i) => {
  const from = i * SECS, to = from + SECS;
  const own = samples.filter((s) => {
    const ct = ((s.t + offset) % (photos.length * SECS));
    return ct >= from + 0.3 && ct < to - 0.1;
  });
  const on = own.filter((s) => s.tracked);
  const first = on.length ? on[0].t - own[0].t : null;
  // jitter: how much the page centre moves on screen while the photo stands still (px, std)
  const sd = (k) => { const v = on.map((s) => s[k]).filter((x) => x !== undefined); if (v.length < 4) return null; const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
  // measured on the settled second half of the photo only (the start includes the glide from the previous photo)
  const settled = on.filter((q) => ((q.t + offset) % (photos.length * SECS)) >= from + SECS / 2);
  const sds = (k) => { const v = settled.map((q) => q[k]).filter((x) => x !== undefined); if (v.length < 4) return null; const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
  const jit = settled.length > 6 ? Math.hypot(sds('sx') || 0, sds('sy') || 0) : null;
  return { photo: p, tracked: own.length ? on.length / own.length : 0, firstLock: first, ids: [...new Set(on.map((s) => s.id))].join(','), jit };
});
const ok = rows.filter((r) => r.tracked > 0).length;
console.log(`\n${label} · scene ${scene}: ${ok}/${rows.length} photos recognised` + (errors.length ? `  errors: ${errors[0]}` : ''));
for (const r of rows) {
  console.log(`  ${r.photo.padEnd(16)} ${r.tracked ? '✓' : '✗'} tracked ${(r.tracked * 100).toFixed(0).padStart(3)}%` +
    (r.firstLock !== null ? `  lock after ${r.firstLock.toFixed(1)}s` : '') + (r.jit !== null ? `  jitter ${r.jit.toFixed(1)}px` : '') + (r.ids ? `  [${r.ids}]` : ''));
}
