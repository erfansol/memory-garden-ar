// Home-page hero image + scene thumbnails, rendered from the Preview mode:
//   node tools/make-thumbs.mjs   (needs the local server on port 8642)
import { chromium } from 'playwright';
import sharp from 'sharp';

const SHOTS = [
  { scene: 1, t: 10, cam: '0.3,-0.66,0.42', look: '0.1,0.07,0.1' },
  { scene: 7, t: 21, cam: '0.05,-0.62,0.42', look: '0,0.02,0.1' },
  { scene: 8, t: 19, cam: '0.3,-0.62,0.42', look: '0.12,0.0,0.08' },
  { scene: 9, t: 20, cam: '0.05,-0.72,0.42', look: '0,0.03,0.14' },
];
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
for (const s of SHOTS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:8642/app.html?scene=${s.scene}&mode=preview&clean&cam=${s.cam}&look=${s.look}`);
  await page.waitForFunction(() => !document.getElementById('loading').classList.contains('show'), null, { timeout: 60000 });
  await page.waitForTimeout(s.t * 1000);
  const png = await page.screenshot();
  await sharp(png).resize(960, 600).jpeg({ quality: 84, mozjpeg: true }).toFile(`assets/thumbs/scene${s.scene}.jpg`);
  console.log('thumb scene', s.scene);
  await page.close();
}
// hero: Scene 9 against the paper, flowers grown
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 1120 }, deviceScaleFactor: 1 });
  await page.goto('http://localhost:8642/app.html?scene=9&mode=preview&clean&bg=ece2d0&cam=0.03,-0.55,0.52&look=0,0.07,0.12');
  await page.waitForFunction(() => !document.getElementById('loading').classList.contains('show'), null, { timeout: 60000 });
  await page.waitForTimeout(21000);
  await sharp(await page.screenshot()).resize(1200, 960).jpeg({ quality: 84, mozjpeg: true }).toFile('assets/hero.jpg');
  console.log('hero');
  await page.close();
}
await browser.close();
