// Detection vs. viewing angle: for each elevation, a fresh page load looks at a synthetic
// view of the page and we time how long until a target of the scene locks on.
//   node tools/targets/eval_views.mjs <scene> <elev,elev,...>
//   node tools/targets/eval_views.mjs <scene> <from,to> --sweep   (lock at the first angle, then lower the phone)
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';

const [scene, list, flag] = process.argv.slice(2);
const sweep = flag === '--sweep';
const page = `assets/scene${scene}/ground.jpg`;

async function run(y4m, seconds, sample) {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`, '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext({ permissions: ['camera'], viewport: { width: 960, height: 720 } })).newPage();
  await p.goto(`http://localhost:8642/app.html?mode=ar&scene=${scene}`);
  await p.click('#start-btn');
  await p.waitForFunction(() => window.__mg && window.__mg.started, null, { timeout: 60000 });
  const out = [];
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    const s = await p.evaluate(() => window.__mg.status());
    out.push({ t: (Date.now() - t0) / 1000, ...s });
    await p.waitForTimeout(sample);
  }
  await b.close();
  return out;
}

if (!sweep) {
  for (const e of list.split(',')) {
    const y = join(tmpdir(), `mg-view-${scene}-${e}.y4m`);
    execFileSync('python3', ['tools/targets/views.py', page, y, e, '3']);
    const s = await run(y, 12, 150);
    const hit = s.find((x) => x.tracked);
    const share = s.filter((x) => x.tracked).length / s.length;
    console.log(`scene ${scene} elevation ${e.padStart(2)}°: ${hit ? `lock after ${hit.t.toFixed(1)}s, tracked ${(share * 100).toFixed(0)}% [${hit.id}]` : 'no lock in 12 s'}`);
  }
} else {
  const [a, z] = list.split(',');
  const y = join(tmpdir(), `mg-sweep-${scene}.y4m`);
  // 3 s held at the start angle, then a slow 12 s move down to the end angle, then held
  execFileSync('python3', ['tools/targets/views.py', page, y, `${a},${a},${z}`, '15', '--sweep']);
  const s = await run(y, 15, 100);
  const lock = s.find((x) => x.tracked);
  const after = lock ? s.filter((x) => x.t >= lock.t) : [];
  const lost = after.find((x) => !x.tracked);
  const angle = (t) => {
    const k = Math.min(1, t / 15);
    return (+a + (+z - +a) * k).toFixed(0);
  };
  console.log(`scene ${scene} sweep ${a}°→${z}°: ` + (lock ? `lock at ~${angle(lock.t)}°, ` + (lost ? `first lost at ~${angle(lost.t)}°` : `held all the way down to ${z}°`) : 'never locked'));
}
