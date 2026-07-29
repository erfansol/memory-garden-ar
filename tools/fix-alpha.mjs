// Background removal via edge flood-fill (white areas inside the artwork are preserved)
// Run:  node tools/fix-alpha.mjs
import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, '..');

async function floodAlpha(src, dst, { region = null, width, tol = 26, feather = true }) {
  let p = sharp(src).ensureAlpha();
  if (region) p = sharp(await p.extract(region).toBuffer()).ensureAlpha();
  const { data, info } = await p.raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;

  // Reference background color: average of the four corners
  const corner = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const cs = [corner(0, 0), corner(W - 1, 0), corner(0, H - 1), corner(W - 1, H - 1)];
  const bg = [0, 1, 2].map((c) => cs.reduce((s, v) => s + v[c], 0) / 4);

  const near = (i) => {
    const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) < tol || data[i + 3] < 12;
  };

  const seen = new Uint8Array(W * H);
  const queue = [];
  for (let x = 0; x < W; x++) { queue.push(x, x + (H - 1) * W); }
  for (let y = 0; y < H; y++) { queue.push(y * W, y * W + W - 1); }
  while (queue.length) {
    const idx = queue.pop();
    if (seen[idx]) continue;
    const i4 = idx * 4;
    if (!near(i4)) continue;
    seen[idx] = 1;
    data[i4 + 3] = 0;
    const x = idx % W, y = (idx / W) | 0;
    if (x > 0) queue.push(idx - 1);
    if (x < W - 1) queue.push(idx + 1);
    if (y > 0) queue.push(idx - W);
    if (y < H - 1) queue.push(idx + W);
  }
  // Soften the edge: pixels adjacent to removed areas get partial transparency
  if (feather) {
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      if (seen[idx]) continue;
      const n = seen[idx - 1] + seen[idx + 1] + seen[idx - W] + seen[idx + W];
      if (n > 0) data[idx * 4 + 3] = Math.min(data[idx * 4 + 3], 255 - n * 50);
    }
  }
  const png = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  const trimmed = await sharp(png).trim({ threshold: 10 }).toBuffer();
  await sharp(trimmed).resize({ width, withoutEnlargement: true }).png().toFile(dst);
  console.log('  •', dst.replace(ROOT + '/', ''));
}

const A1 = join(SRC, 'Scene1/01_Assets1.png');
await floodAlpha(A1, join(ROOT, 'assets/scene1/girl_desk.png'), { region: { left: 52, top: 2, width: 182, height: 186 }, width: 420, tol: 30 });
await floodAlpha(A1, join(ROOT, 'assets/scene1/boy_desk.png'), { region: { left: 234, top: 2, width: 184, height: 182 }, width: 420, tol: 30 });
await floodAlpha(A1, join(ROOT, 'assets/scene1/backpacks.png'), { region: { left: 420, top: 60, width: 195, height: 125 }, width: 300, tol: 30 });
await floodAlpha(join(SRC, 'Scene7/07_Girl_Base2.png'), join(ROOT, 'assets/scene7/girl.png'), { width: 460, tol: 30 });
await floodAlpha(join(SRC, 'Scene7/07_Bed_Comp.png'), join(ROOT, 'assets/scene7/bed.png'), { width: 900, tol: 26 });
await floodAlpha(join(SRC, 'Scene7/07_Ground.png'), join(ROOT, 'assets/scene7/bunny.png'), { region: { left: 631, top: 296, width: 80, height: 110 }, width: 240, tol: 24 });

// Rebuild the shadows from the cleaned sprites
const mkShadow = async (src, dst) => {
  const b = await sharp(src).modulate({ brightness: 0.02 }).blur(2.5).toBuffer();
  await sharp(b).png().toFile(dst);
  console.log('  •', dst.replace(ROOT + '/', ''));
};
await mkShadow(join(ROOT, 'assets/scene1/girl_desk.png'), join(ROOT, 'assets/scene1/girl_shadow.png'));
await mkShadow(join(ROOT, 'assets/scene1/boy_desk.png'), join(ROOT, 'assets/scene1/boy_shadow.png'));
console.log('✓ done');
