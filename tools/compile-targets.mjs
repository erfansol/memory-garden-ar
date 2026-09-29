// Compiles the target images (one per leaf of each spread) into targets/targets.mind.
// Run:  node tools/compile-targets.mjs
//
// mind-ar's own OfflineCompiler imports the native `canvas` package only to read
// pixels, and that package often fails to install. We read pixels with sharp and
// feed them straight to the compiler instead.
import sharp from 'sharp';
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CompilerBase } from 'mind-ar/src/image-target/compiler-base.js';
import { buildTrackingImageList } from 'mind-ar/src/image-target/image-list.js';
import { extractTrackingFeatures } from 'mind-ar/src/image-target/tracker/extract-utils.js';
import 'mind-ar/src/image-target/detector/kernels/cpu/index.js';
import * as msgpack from '@msgpack/msgpack';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// targets/targets.json is written by tools/targets/build_targets.py (same order as the app uses)
const TARGETS = JSON.parse(readFileSync(join(ROOT, 'targets', 'targets.json'), 'utf8')).map((t) => t.id);

class RawCompiler extends CompilerBase {
  createProcessCanvas(img) {
    // a tiny stand-in for a 2D canvas: drawImage is a no-op, getImageData returns the pixels
    return {
      getContext: () => ({
        drawImage() {},
        getImageData: () => ({ data: img.data }),
      }),
    };
  }

  compileTrack({ progressCallback, targetImages, basePercent }) {
    const percentPerImage = (100 - basePercent) / targetImages.length;
    let percent = 0;
    const list = [];
    for (const targetImage of targetImages) {
      const imageList = buildTrackingImageList(targetImage);
      const percentPerAction = percentPerImage / imageList.length;
      list.push(extractTrackingFeatures(imageList, () => {
        percent += percentPerAction;
        progressCallback(basePercent + percent);
      }));
    }
    return Promise.resolve(list);
  }
}

const images = [];
for (const id of TARGETS) {
  const { data, info } = await sharp(join(ROOT, 'targets', `${id}.jpg`))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  images.push({
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
  });
  console.log(`loaded: ${id} (${info.width}x${info.height})`);
}

const compiler = new RawCompiler();
let last = -1;
await compiler.compileImageTargets(images, (p) => {
  const pct = Math.floor(p);
  if (pct !== last) { last = pct; process.stdout.write(`\rcompiling: ${pct}%   `); }
});
const buffer = compiler.exportData();
writeFileSync(join(ROOT, 'targets', 'all.mind'), Buffer.from(buffer));
console.log('\n✓ targets/all.mind —', buffer.byteLength, 'bytes');

// one smaller file per scene (faster to download, and detection only compares with
// that scene's targets); same format, just a subset of the compiled list
const all = msgpack.decode(new Uint8Array(buffer));
const meta = JSON.parse(readFileSync(join(ROOT, 'targets', 'targets.json'), 'utf8'));
for (const scene of [...new Set(meta.map((t) => t.scene))]) {
  const idx = meta.map((t, i) => (t.scene === scene ? i : -1)).filter((i) => i >= 0);
  const part = msgpack.encode({ ...all, dataList: idx.map((i) => all.dataList[i]) });
  writeFileSync(join(ROOT, 'targets', `scene${scene}.mind`), Buffer.from(part));
  console.log(`✓ targets/scene${scene}.mind —`, part.byteLength, 'bytes');
}
