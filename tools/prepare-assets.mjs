// Builds the WebAR assets for "The Memory Garden" from the raw book files
// Run:  node tools/prepare-assets.mjs
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, '..');            // the Farnaz_Memory_Garden folder
const OUT = join(ROOT, 'assets');
const TGT = join(ROOT, 'targets');

const log = (...a) => console.log('  •', ...a);

async function resizeTo(src, dst, width, opts = {}) {
  let p = sharp(src).ensureAlpha().resize({ width, withoutEnlargement: true });
  if (opts.trim) p = sharp(await sharp(src).ensureAlpha().trim({ threshold: 12 }).toBuffer())
    .resize({ width, withoutEnlargement: true });
  await p.png({ compressionLevel: 9, palette: false }).toFile(dst);
  log(dst.replace(ROOT + '/', ''));
}

// Crop a region + trim transparent borders + resize
async function crop(src, dst, region, width) {
  const cut = await sharp(src).ensureAlpha().extract(region).toBuffer();
  const buf = await sharp(cut).trim({ threshold: 12 }).toBuffer();
  await sharp(buf).resize({ width, withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(dst);
  log(dst.replace(ROOT + '/', ''));
  return buf;
}

// Silhouette (shadow) from the alpha channel: darkened + blurred
async function silhouette(buf, dst, width) {
  const b = await sharp(buf).resize({ width }).modulate({ brightness: 0.02 }).blur(2.5).toBuffer();
  await sharp(b).png().toFile(dst);
  log(dst.replace(ROOT + '/', ''));
}

// Remove a white background (for AI character sheets) by mapping brightness to alpha
async function whiteToAlpha(src, dst, region, width) {
  const { data, info } = await sharp(src).extract(region).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    // near-white, low-saturation pixels become transparent
    if (mn > 232 && mx - mn < 18) data[i + 3] = 0;
    else if (mn > 205 && mx - mn < 14) data[i + 3] = Math.round(255 * (232 - mn) / 27);
  }
  const pngBuf = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png().toBuffer();
  const buf = await sharp(pngBuf).trim({ threshold: 10 }).toBuffer();
  await sharp(buf).resize({ width }).png().toFile(dst);
  log(dst.replace(ROOT + '/', ''));
  return dst;
}

async function svgPng(svg, dst, size) {
  await sharp(Buffer.from(svg))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toFile(dst);
  log(dst.replace(ROOT + '/', ''));
}

async function main() {
  [OUT, TGT, join(OUT, 'scene1'), join(OUT, 'scene7'), join(OUT, 'scene8'), join(OUT, 'scene9'), join(OUT, 'common')]
    .forEach(d => mkdirSync(d, { recursive: true }));

  console.log('▸ page grounds + tracking targets');
  const grounds = {
    scene1: join(SRC, 'Scene1/01_Ground.png'),
    scene7: join(SRC, 'Scene7/07_Ground.png'),
    scene8: join(SRC, 'Scene8/08_Ground.png'),
    scene9: join(SRC, 'Scene9/09_Ground.png'),
  };
  for (const [k, src] of Object.entries(grounds)) {
    await resizeTo(src, join(OUT, k, 'ground.png'), 1024);
    await sharp(src).flatten({ background: '#ffffff' }).resize({ width: 1000 })
      .jpeg({ quality: 92 }).toFile(join(TGT, `${k}.jpg`));
    log(`targets/${k}.jpg`);
  }

  console.log('▸ scene 1 — classroom and memories');
  const a1 = join(SRC, 'Scene1/01_Assets1.png');
  const girlBuf = await crop(a1, join(OUT, 'scene1', 'girl_desk.png'), { left: 52, top: 2, width: 182, height: 186 }, 420);
  const boyBuf  = await crop(a1, join(OUT, 'scene1', 'boy_desk.png'),  { left: 234, top: 2, width: 184, height: 182 }, 420);
  await crop(a1, join(OUT, 'scene1', 'backpacks.png'), { left: 420, top: 60, width: 195, height: 125 }, 300);
  await crop(a1, join(OUT, 'scene1', 'wall.png'), { left: 0, top: 188, width: 843, height: 408 }, 1400);
  await silhouette(girlBuf, join(OUT, 'scene1', 'girl_shadow.png'), 360);
  await silhouette(boyBuf,  join(OUT, 'scene1', 'boy_shadow.png'), 360);

  console.log('▸ scene 7 — bedroom and the doll');
  await resizeTo(join(SRC, 'Scene7/07_Wall.png'), join(OUT, 'scene7', 'wall.png'), 1600);
  await resizeTo(join(SRC, 'Scene7/07_Bed_Comp.png'), join(OUT, 'scene7', 'bed.png'), 900);
  await resizeTo(join(SRC, 'Scene7/07_Girl_Base2.png'), join(OUT, 'scene7', 'girl.png'), 460, { trim: true });
  await resizeTo(join(SRC, 'Scene7/07_Mother.png'), join(OUT, 'scene7', 'mother.png'), 420, { trim: true });
  await resizeTo(join(SRC, '07_Paperplane.png'), join(OUT, 'common', 'paperplane.png'), 300);
  await crop(join(SRC, 'Scene7/07_Ground.png'), join(OUT, 'scene7', 'bunny.png'), { left: 630, top: 295, width: 100, height: 115 }, 260);

  console.log('▸ scene 8 — the growing garden');
  await resizeTo(join(SRC, 'Scene8/08_Final_Small.png'),  join(OUT, 'scene8', 'bush_small.png'), 1500);
  await resizeTo(join(SRC, 'Scene8/08_Final_Medium.png'), join(OUT, 'scene8', 'bush_medium.png'), 1500);
  await resizeTo(join(SRC, 'Scene8/08_Final_Tall.png'),   join(OUT, 'scene8', 'bush_tall.png'), 1500);
  // Standing girl (front view of the AI character sheet) — white background removed
  await whiteToAlpha(join(SRC, 'Scene8/Character/ChatGPT Image Jul 26, 2026, 03_53_51 PM.png'),
    join(OUT, 'scene8', 'girl_stand.png'), { left: 40, top: 10, width: 500, height: 500 }, 420);

  console.log('▸ scene 9 — the memory garden');
  await resizeTo(join(SRC, 'Scene9/09_Char.png'),  join(OUT, 'scene9', 'girl_full.png'), 1100);
  await resizeTo(join(SRC, 'Scene9/09_Char2.png'), join(OUT, 'scene9', 'hair_back.png'), 1100);
  await resizeTo(join(SRC, 'Scene9/09_Char3.png'), join(OUT, 'scene9', 'hair_flowers.png'), 900);
  await resizeTo(join(SRC, 'Scene9/09_Char4.png'), join(OUT, 'scene9', 'hair_plain.png'), 600);
  await resizeTo(join(SRC, 'Scene9/BushFlow1.png'), join(OUT, 'scene9', 'bushflow1.png'), 1500);
  await resizeTo(join(SRC, 'Scene9/BushFlow2.png'), join(OUT, 'scene9', 'bushflow2.png'), 1500);
  await resizeTo(join(SRC, 'Scene9/BushFlow3.png'), join(OUT, 'scene9', 'bushflow3.png'), 1500);

  console.log('▸ particles and effects (generated from SVG)');
  const G = (stops) => stops.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${op}"/>`).join('');
  await svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="g">${G([[0, '#fff7e0', 1], [0.5, '#ffe9b3', 0.55], [1, '#ffe9b3', 0]])}</radialGradient></defs><circle cx="32" cy="32" r="32" fill="url(#g)"/></svg>`, join(OUT, 'common', 'glow.png'), 64);
  await svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="g">${G([[0, '#ffffff', 1], [0.6, '#ffffff', 0.75], [1, '#ffffff', 0]])}</radialGradient></defs><circle cx="32" cy="32" r="32" fill="url(#g)"/></svg>`, join(OUT, 'common', 'snow.png'), 48);
  await svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><path d="M20 3 C29 8 31 20 20 37 C9 20 11 8 20 3 Z" fill="#d98f4e" opacity="0.95"/><path d="M20 6 L20 33" stroke="#a5662f" stroke-width="1.4" opacity="0.7"/></svg>`, join(OUT, 'common', 'leaf.png'), 40);
  await svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><ellipse cx="20" cy="20" rx="9" ry="15" fill="#f6c9d8" opacity="0.95" transform="rotate(25 20 20)"/></svg>`, join(OUT, 'common', 'petal.png'), 36);
  await svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="12" height="48"><rect x="5" y="2" width="2.2" height="44" rx="1.1" fill="#9fb8d8" opacity="0.8"/></svg>`, join(OUT, 'common', 'rain.png'), 48);
  await svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><path d="M32 4 L37 27 L60 32 L37 37 L32 60 L27 37 L4 32 L27 27 Z" fill="#fff3c4"/></svg>`, join(OUT, 'common', 'sparkle.png'), 56);
  await svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="g">${G([[0.55, '#ffdf9e', 0], [0.72, '#ffdf9e', 0.9], [1, '#ffdf9e', 0]])}</radialGradient></defs><circle cx="32" cy="32" r="32" fill="url(#g)"/></svg>`, join(OUT, 'common', 'ring.png'), 64);
  await svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><path d="M32 56 C10 40 6 24 16 16 C24 10 31 15 32 21 C33 15 40 10 48 16 C58 24 54 40 32 56 Z" fill="#f2a7b8"/></svg>`, join(OUT, 'common', 'heart.png'), 56);
  await svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40"><ellipse cx="16" cy="20" rx="9" ry="14" fill="#8a5a33"/><ellipse cx="13" cy="15" rx="3" ry="5" fill="#a8744a" opacity="0.8"/></svg>`, join(OUT, 'common', 'seed.png'), 36);
  await svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="64"><path d="M24 60 L24 30" stroke="#5f8b4a" stroke-width="4" stroke-linecap="round"/><path d="M24 38 C14 36 10 26 12 18 C20 20 25 26 24 38 Z" fill="#79a85e"/><path d="M24 34 C34 32 38 22 36 14 C28 16 23 22 24 34 Z" fill="#8fbf72"/></svg>`, join(OUT, 'common', 'sprout.png'), 56);

  console.log('✓ all assets ready');
}
main().catch(e => { console.error(e); process.exit(1); });
