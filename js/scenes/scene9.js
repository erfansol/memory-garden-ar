// Scene 9 — "The Memory Garden": a calm, breathing ending. Diana stands in the garden,
// the wind moves through her hair and the flowering bushes, new flowers grow around
// the page, and paper planes drift across on the breeze, trailing little dotted paths.
import * as THREE from 'three';
import { loadTextures, loadTexture, window01, smooth01, pulse } from '../engine.js';
import { videoPlane, atlasPlane, loadManifest } from '../video.js';
import { Particles, PaperPlane, WindRibbon, TEX, bezier, contactShadow } from '../fx.js';
import { Experience, AppearFX } from '../stage.js';

const GIRL = { x: 0.0, y: 0.08, h: 0.4 };
const BUSH = { x: 0.0, y: 0.025, w: 0.56 };
// new flowers around the page (clear of the printed text and the Scan Here icon)
const FLOWERS = [
  [-0.36, -0.01, 's9_lavender', 0.12], [-0.23, -0.09, 's9_daisy', 0.11], [-0.09, -0.12, 's9_lavender', 0.1],
  [0.1, -0.115, 's9_daisy', 0.1], [0.215, -0.05, 's9_lavender', 0.11], [-0.42, 0.16, 's9_daisy', 0.1],
  [0.4, 0.17, 's9_lavender', 0.1], [0.3, 0.1, 's9_daisy', 0.09],
];
const FLIGHTS = [
  { path: bezier([-0.62, -0.02, 0.2], [-0.2, 0.32, 0.44], [0.15, -0.22, 0.17], [0.62, 0.12, 0.3]), start: 3, dur: 9, every: 13 },
  { path: bezier([0.62, 0.26, 0.36], [0.2, 0.04, 0.12], [-0.2, 0.36, 0.32], [-0.62, 0.0, 0.22]), start: 9.5, dur: 10, every: 14 },
];
const CAPTION_LOOP = 40;

async function garden() {
  const X = new Experience('s9_flower');
  X.title = 'Scene 9 · The Memory Garden';
  const g = X.group;
  const manifest = await loadManifest();
  const T = await loadTextures({ plane: 'common/paperplane.png', petal: 'common/petal.png', leaf: 'common/leaf.png' });
  const [girlClip, bushClip] = await Promise.all([X.clip('s9_girl'), X.clip('s9_bush')]);
  const grow = {};
  for (const k of ['s9_daisy', 's9_lavender']) grow[k] = { meta: manifest[k], tex: (await loadTexture(manifest[k].file)).tex };
  X.loops.push({ key: 'girl', url: girlClip.meta.audio, vol: 0.45 }, { key: 'wind', url: bushClip.meta.audio, vol: 0.25 });

  const girl = X.billboard(videoPlane(girlClip, GIRL.h, { reveal: 0, revealColor: 0xffe0b0, renderOrder: 10 }), { smooth: 0.08 });
  girl.position.set(GIRL.x, GIRL.y, 0);
  girl.userData.spin.add(contactShadow(0.3, 0.07, 0.25));
  const bush = X.billboard(videoPlane(bushClip, BUSH.w / bushClip.meta.aspect, { reveal: 0, revealColor: 0xf3ffd6, renderOrder: 12 }), { smooth: 0.08 });
  bush.position.set(BUSH.x, BUSH.y, 0);
  bush.userData.spin.add(contactShadow(BUSH.w * 0.95, 0.07, 0.3));
  g.add(girl, bush);
  const appear = new AppearFX(g, { x: GIRL.x, y: GIRL.y, height: GIRL.h * 0.6, radius: 0.12, pillar: false, count: 40 });

  const flowers = FLOWERS.map(([x, y, kind, h], i) => {
    const f = X.billboard(atlasPlane(grow[kind].tex, grow[kind].meta, h, { renderOrder: 8 }));
    f.position.set(x, y, 0);
    f.visible = false;
    g.add(f);
    return { f, at: 2.2 + i * 0.75, frames: grow[kind].meta.frames, i };
  });

  const planes = FLIGHTS.map(() => new PaperPlane(g, T.plane.tex, { size: 0.055 }));
  const ribbons = [0, 1, 2, 3, 4].map((i) => new WindRibbon(g, bezier(
    [-0.6, -0.1 + i * 0.08, 0.08 + i * 0.05],
    [-0.2, 0.1 + i * 0.03, 0.2 + (i % 2) * 0.1],
    [0.2, -0.05 + i * 0.05, 0.12 + i * 0.04],
    [0.6, 0.05 + i * 0.04, 0.18 + (i % 3) * 0.05],
  ), { width: 0.005, len: 0.3, opacity: 0.45 }));
  const box = { x: [-0.6, 0.6], y: [-0.16, 0.3], z: [0.04, 0.46] };
  const petals = new Particles(g, {
    count: 26, map: T.petal.tex, size: [0.011, 0.018], mode: 'across', spin: 1.8, sway: 0.03, swayFreq: 0.7,
    speed: [0.035, 0.06], colors: [0xffffff, 0xffe9f0, 0xfff6e0], box, seed: 91,
  });
  const leaves = new Particles(g, {
    count: 9, map: T.leaf.tex, size: [0.012, 0.018], mode: 'across', spin: 2.2, sway: 0.03,
    speed: [0.04, 0.06], colors: [0xc9e0a0, 0xb5d38a], box, seed: 92,
  });
  const motes = new Particles(g, {
    count: 24, map: TEX.dot(), size: [0.005, 0.012], mode: 'float', additive: true, twinkle: 0.9, sway: 0.03, swayFreq: 0.3,
    colors: [0xfff4cc, 0xffffff], box: { x: [-0.4, 0.4], y: [-0.12, 0.25], z: [0.03, 0.4] }, seed: 93,
  });

  X.update = (t, camera) => {
    X.once('go', t, 0.3, () => { bushClip.play(); girlClip.play(); appear.trigger(t + 0.7); });
    appear.update(t);
    bush.userData.mat.uniforms.reveal.value = smooth01((t - 0.3) / 1.8);
    girl.userData.mat.uniforms.reveal.value = smooth01((t - 1.0) / 1.9);

    for (const fl of flowers) {
      fl.f.visible = t > fl.at;
      if (!fl.f.visible) continue;
      const u = fl.f.userData.mat.uniforms;
      u.frame.value = Math.min(1, (t - fl.at) / 7) * (fl.frames - 1);
      u.opacity.value = smooth01((t - fl.at) / 0.5);
      // the wind bends every flower a little, each in its own rhythm
      u.uBend.value = 0.05 * Math.sin(t * 1.25 + fl.i * 0.9) + 0.02 * Math.sin(t * 2.9 + fl.i);
    }

    FLIGHTS.forEach((f, i) => {
      const local = t < f.start ? -1 : (t - f.start) % f.every;
      const k = local / f.dur;
      const vis = local >= 0 && k <= 1 ? Math.min(1, k * 8, (1 - k) * 8) : 0;
      planes[i].update(t, Math.max(0, Math.min(1, k)), f.path, vis, camera);
    });
    ribbons.forEach((r, i) => {
      const period = 7 + i * 1.3;
      const local = ((t + i * 2.1) % period) / 3.2;
      r.update(local * 1.3, smooth01((t - 2) / 2));
    });
    const amb = smooth01((t - 1.5) / 2.5);
    petals.set(amb); petals.update(t);
    leaves.set(amb); leaves.update(t);
    motes.set(amb * (0.8 + 0.2 * pulse(t, 5))); motes.update(t);

    const c = t % CAPTION_LOOP;
    let msg = '';
    if (window01(c, 2.5, 4.8, 0.5) > 0.5) msg = 'Days passed. The seeds grew.';
    else if (window01(c, 14, 5, 0.5) > 0.5) msg = 'Things changed slowly. Quietly.';
    else if (window01(c, 21, 5.5, 0.5) > 0.5) msg = 'Like the garden. Like me.';
    X.say(msg);
  };
  return X;
}

export const STATIONS = { s9_flower: garden };

export async function popup() {
  return new THREE.Group();   // everything in this scene is part of the AR layer
}
