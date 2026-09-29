// Scene 9 — "The Memory Garden": a calm, looping ending. Diana and the flowering bush
// move in the wind. A paper plane glides in from the left and out to the right, and
// along its path blue and violet flowers grow one after another; once grown they keep
// swaying gently in the breeze.
import * as THREE from 'three';
import { loadTextures, loadTexture, window01, smooth01, pulse } from '../engine.js';
import { videoPlane, atlasPlane, loadManifest } from '../video.js';
import { Particles, PaperPlane, WindRibbon, TEX, bezier, contactShadow } from '../fx.js';
import { Experience, AppearFX } from '../stage.js';

const GIRL = { x: 0.0, y: 0.08, h: 0.4 };
const BUSH = { x: 0.0, y: 0.025, w: 0.56 };
// the paper plane's flight: in from the left edge, low over the page, out on the right
const FLIGHT = { path: bezier([-0.7, -0.03, 0.24], [-0.3, -0.24, 0.07], [0.12, 0.03, 0.25], [0.7, -0.13, 0.2]), start: 2.5, dur: 10, every: 30 };
// flowers along the plane's path (x, y, height, blue shift); clear of the text and the icon
const FLOWERS = [
  [-0.4, -0.075, 0.12, 0.0], [-0.24, -0.1, 0.11, 0.8], [-0.075, -0.09, 0.12, 0.3],
  [0.1, -0.08, 0.11, 0.9], [0.235, -0.105, 0.12, 0.2],
];
const GROW = 6;            // seconds to grow
const CAPTION_LOOP = 40;

async function garden() {
  const X = new Experience('s9_flower');
  X.title = 'Scene 9 · The Memory Garden';
  const g = X.group;
  const manifest = await loadManifest();
  const T = await loadTextures({ plane: 'common/paperplane.png', petal: 'common/petal.png', leaf: 'common/leaf.png' });
  const [girlClip, bushClip] = await Promise.all([X.clip('s9_girl'), X.clip('s9_bush')]);
  const lav = { meta: manifest.s9_lavender, tex: (await loadTexture(manifest.s9_lavender.file)).tex };
  X.loops.push({ key: 'girl', url: girlClip.meta.audio, vol: 0.45 }, { key: 'wind', url: bushClip.meta.audio, vol: 0.25 });

  // Diana and the bush (both loop)
  const girl = X.billboard(videoPlane(girlClip, GIRL.h, { reveal: 0, revealColor: 0xffe0b0, renderOrder: 10 }), { smooth: 0.08 });
  girl.position.set(GIRL.x, GIRL.y, 0);
  girl.userData.spin.add(contactShadow(0.3, 0.07, 0.25));
  const bush = X.billboard(videoPlane(bushClip, BUSH.w / bushClip.meta.aspect, { reveal: 0, revealColor: 0xf3ffd6, renderOrder: 12 }), { smooth: 0.08 });
  bush.position.set(BUSH.x, BUSH.y, 0);
  bush.userData.spin.add(contactShadow(BUSH.w * 0.95, 0.07, 0.3));
  g.add(girl, bush);
  const appear = new AppearFX(g, { x: GIRL.x, y: GIRL.y, height: GIRL.h * 0.6, radius: 0.12, pillar: false, count: 40 });

  // the paper plane and the flowers it wakes up
  const plane = new PaperPlane(g, T.plane.tex, { size: 0.055 });
  const flowers = FLOWERS.map(([x, y, h, blue], i) => {
    const f = X.billboard(atlasPlane(lav.tex, lav.meta, h, { renderOrder: 8, blueShift: blue }));
    f.position.set(x, y, 0);
    f.visible = false;
    g.add(f);
    const puff = new Particles(g, { count: 12, map: TEX.star(), size: [0.007, 0.014], mode: 'burst', additive: true, center: [x, y, 0.02], burstSpeed: [0.02, 0.05], life: [0.7, 1.2], colors: [0xffffff, 0xdcd6ff] });
    return { f, x, i, puff, at: null };
  });

  // a light breeze: streaks of air, petals, leaves and floating specks of light
  const ribbons = [0, 1, 2, 3].map((i) => new WindRibbon(g, bezier(
    [-0.6, -0.1 + i * 0.09, 0.1 + i * 0.05],
    [-0.2, 0.1 + i * 0.03, 0.22 + (i % 2) * 0.1],
    [0.2, -0.05 + i * 0.05, 0.14 + i * 0.04],
    [0.6, 0.05 + i * 0.04, 0.2 + (i % 3) * 0.05],
  ), { width: 0.005, len: 0.3, opacity: 0.4 }));
  const box = { x: [-0.6, 0.6], y: [-0.16, 0.3], z: [0.04, 0.46] };
  const petals = new Particles(g, {
    count: 18, map: T.petal.tex, size: [0.011, 0.018], mode: 'across', spin: 1.8, sway: 0.03, swayFreq: 0.7,
    speed: [0.035, 0.06], colors: [0xffffff, 0xffe9f0, 0xfff6e0], box, seed: 91,
  });
  const leaves = new Particles(g, {
    count: 7, map: T.leaf.tex, size: [0.012, 0.018], mode: 'across', spin: 2.2, sway: 0.03,
    speed: [0.04, 0.06], colors: [0xc9e0a0, 0xb5d38a], box, seed: 92,
  });
  const motes = new Particles(g, {
    count: 20, map: TEX.dot(), size: [0.005, 0.012], mode: 'float', additive: true, twinkle: 0.9, sway: 0.03, swayFreq: 0.3,
    colors: [0xfff4cc, 0xffffff], box: { x: [-0.4, 0.4], y: [-0.12, 0.25], z: [0.03, 0.4] }, seed: 93,
  });

  X.onRestart = () => flowers.forEach((fl) => { fl.at = null; fl.f.visible = false; });

  X.update = (t, camera) => {
    X.once('go', t, 0.3, () => { bushClip.play(); girlClip.play(); appear.trigger(t + 0.7); });
    appear.update(t);
    bush.userData.mat.uniforms.reveal.value = smooth01((t - 0.3) / 1.8);
    girl.userData.mat.uniforms.reveal.value = smooth01((t - 1.0) / 1.9);

    // the plane crosses the page (first at 2.5 s, then every 30 s)
    const local = t < FLIGHT.start ? -1 : (t - FLIGHT.start) % FLIGHT.every;
    const k = local / FLIGHT.dur;
    const flying = local >= 0 && k <= 1;
    const vis = flying ? Math.min(1, k * 10, (1 - k) * 10) : 0;
    plane.update(t, Math.max(0, Math.min(1, k)), FLIGHT.path, vis, camera);
    const planeX = flying ? FLIGHT.path(k)[0] : -1;

    for (const fl of flowers) {
      // a flower starts growing as the plane passes over it
      if (fl.at === null && flying && planeX >= fl.x) { fl.at = t; fl.puff.trigger(t); }
      fl.puff.update(t);
      fl.f.visible = fl.at !== null;
      if (!fl.f.visible) continue;
      const u = fl.f.userData.mat.uniforms;
      const last = lav.meta.frames - 1;
      const age = t - fl.at;
      // grow, then keep gently moving through the last few frames
      u.frame.value = age < GROW ? (age / GROW) * last : last - 6 * pulse(age - GROW, 4.5 + fl.i * 0.4);
      u.opacity.value = smooth01(age / 0.5);
      u.uBend.value = 0.045 * Math.sin(t * 1.2 + fl.i * 0.9) + 0.015 * Math.sin(t * 2.7 + fl.i);
    }

    ribbons.forEach((r, i) => {
      const period = 8 + i * 1.5;
      const l = ((t + i * 2.3) % period) / 3.2;
      r.update(l * 1.3, smooth01((t - 2) / 2));
    });
    const amb = smooth01((t - 1.5) / 2.5);
    petals.set(amb); petals.update(t);
    leaves.set(amb); leaves.update(t);
    motes.set(amb * (0.8 + 0.2 * pulse(t, 5))); motes.update(t);

    const c = t % CAPTION_LOOP;
    let msg = '';
    if (window01(c, 14, 5, 0.5) > 0.5) msg = 'Things changed slowly. Quietly.';
    else if (window01(c, 21, 5.5, 0.5) > 0.5) msg = 'Like the garden. Like me.';
    X.say(msg);
  };
  return X;
}

export const STATIONS = { s9_flower: garden };

export async function popup() {
  return new THREE.Group();   // everything in this scene is part of the AR layer
}
