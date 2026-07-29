// Compiles the target images into targets.mind for MindAR tracking
// Run:  node tools/compile-targets.mjs
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { OfflineCompiler } from 'mind-ar/src/image-target/offline-compiler.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCENES = ['scene1', 'scene7', 'scene8', 'scene9'];

const images = [];
for (const s of SCENES) {
  const { data, info } = await sharp(join(ROOT, 'targets', `${s}.jpg`))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  images.push({
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
  });
  console.log(`loaded: ${s} (${info.width}x${info.height})`);
}

const compiler = new OfflineCompiler();
let last = -1;
await compiler.compileImageTargets(images, (p) => {
  const pct = Math.floor(p);
  if (pct !== last) { last = pct; process.stdout.write(`\rcompiling: ${pct}%   `); }
});
const buffer = compiler.exportData();
writeFileSync(join(ROOT, 'targets', 'targets.mind'), Buffer.from(buffer));
console.log('\n✓ targets/targets.mind written —', buffer.byteLength, 'bytes');
