// Scene 8 — "Planting Seeds": Diana comes out of the bushes and plants three seeds,
// one for each quiet promise. Each seed answers with a soft light and a tiny sprout.
import * as THREE from 'three';
import { loadTextures, loadTexture, window01, smooth01, seg, lerp, easeInOut, pulse, cutout } from '../engine.js';
import { videoPlane, atlasPlane, loadManifest } from '../video.js';
import { Particles, GroundRing, TEX, contactShadow, flatSprite, faceCamera } from '../fx.js';
import { Experience, AppearFX } from '../stage.js';
import { px } from '../layout.js';

const LOOP = 73;
const H = 0.27;                       // height of the video cut-out (girl + soil mound)
const WALK_V = 0.2222;                // in the first frame, everything below this is the soil mound
const PLANTED_V = 0.3;                // planted.png = bottom 30% of the last frame (mound + sprout)
const ENTRY = [0.1, 0.13];            // she steps out from between the paper bushes
const SPOTS = [
  { p: px(2874, 1467), fx: 'sparkles', grow: 's9_daisy' },   // the printed hole with the seed
  { p: [0.02, -0.04], fx: 'petals', grow: 's9_lavender' },
  { p: [-0.25, 0.09], fx: 'rain', grow: 's9_daisy' },
];
const MSGS = [
  '“I can’t bring you back, but I can keep your memory with kindness.”',
  '“Every time I remember you, something small grows inside me.”',
  '“Memories don’t end; they only change their shape.”',
];
// [arrive, playStart, rate] for the three plantings; the video is 21 s long
const PLANT = [
  { walk: [1.2, 3.0], play: 5.0, rate: 1.0 },
  { walk: [26.3, 2.5], play: 29.6, rate: 1.5 },
  { walk: [43.9, 2.5], play: 47.2, rate: 1.5 },
];
const VIDEO_LEN = 21.0;
// moments inside the video (seconds at normal speed)
const V_SEED = 9.5, V_COVER = 14.0, V_SPROUT = 16.6;

async function planting() {
  const X = new Experience('s8_hole');
  X.title = 'Scene 8 · Planting Seeds';
  const g = X.group;
  const manifest = await loadManifest();
  const T = await loadTextures({ planted: 'scene8/planted.png', petal: 'common/petal.png', glow: 'common/glow.png' });
  const clip = await X.clip('s8_girl');
  const grow = {};
  for (const k of ['s9_daisy', 's9_lavender']) grow[k] = { meta: manifest[k], tex: (await loadTexture(manifest[k].file)).tex };

  const girl = X.billboard(videoPlane(clip, H, { reveal: 0, revealColor: 0xffe7b8, renderOrder: 14 }));
  const gm = girl.userData.mat.uniforms;
  girl.userData.spin.add(contactShadow(0.1, 0.03, 0.35));
  g.add(girl);
  const appear = new AppearFX(g, { x: ENTRY[0], y: ENTRY[1], height: H * 0.7, radius: 0.06 });
  const puff = new Particles(g, { count: 16, map: TEX.dot(), size: [0.008, 0.016], mode: 'burst', burstSpeed: [0.03, 0.07], life: [0.6, 1.1], color: 0xe8d2a8, opacity: 0.8, gravity: -0.2 });
  const swap = new Particles(g, { count: 20, map: TEX.star(), size: [0.01, 0.022], mode: 'burst', additive: true, burstSpeed: [0.04, 0.09], life: [0.6, 1.2], colors: [0xffffff, 0xfff0c0] });

  const stations = SPOTS.map((s, i) => {
    const [x, y] = s.p;
    const planted = X.billboard(new THREE.Group());
    const pm = cutout(T.planted, H * clip.meta.aspect, { renderOrder: 10 });
    planted.add(pm);
    planted.position.set(x, y, 0);
    planted.visible = false;
    g.add(planted);
    const glow = flatSprite(TEX.dot(), 0.1, 0.06, { additive: true, color: 0xffd98a, opacity: 0 });
    glow.position.set(x, y, 0.003);
    g.add(glow);
    const seedBurst = new Particles(g, { count: 16, map: TEX.star(), size: [0.008, 0.018], mode: 'burst', additive: true, center: [x, y, 0.02], burstSpeed: [0.02, 0.06], life: [0.8, 1.4], colors: [0xffffff, 0xffe9a8] });
    const ring = new GroundRing(g, { size: 0.14, color: 0xffe4a8, dur: 1.8 });
    let fx;
    const b = (dx, z) => ({ x: [x - dx, x + dx], y: [y - dx * 0.6, y + dx * 0.6], z });
    if (s.fx === 'sparkles') fx = new Particles(g, { count: 16, map: TEX.star(), size: [0.008, 0.016], mode: 'float', additive: true, twinkle: 1, sway: 0.01, colors: [0xffffff, 0xfff0b8], box: b(0.05, [0.02, 0.15]), seed: 81 });
    else if (s.fx === 'petals') fx = new Particles(g, { count: 13, map: T.petal.tex, size: [0.01, 0.016], mode: 'fall', spin: 1.6, sway: 0.02, speed: [0.02, 0.035], colors: [0xd8c4ff, 0xc9b0f5, 0xeadcff], box: b(0.06, [0.005, 0.22]), seed: 82 });
    else fx = new Particles(g, { count: 28, map: TEX.streak(), size: [0.014, 0.022], mode: 'fall', spin: 0, sway: 0.002, speed: [0.35, 0.5], color: 0xcfe2ff, opacity: 0.55, box: b(0.05, [0.0, 0.24]), seed: 83 });
    const ripples = s.fx === 'rain' ? [0, 1, 2].map(() => new GroundRing(g, { size: 0.03, color: 0xe6f0ff, dur: 1.1 })) : [];
    // the finale: each sprout grows into a flower
    const plant = X.billboard(atlasPlane(grow[s.grow].tex, grow[s.grow].meta, 0.12, { renderOrder: 11 }));
    plant.position.set(x, y + 0.004, H * 0.19);
    plant.visible = false;
    g.add(plant);
    return { x, y, planted, glow, seedBurst, ring, fx, ripples, plant, seen: -1 };
  });

  X.onRestart = () => {
    stations.forEach((s) => { s.planted.visible = false; s.plant.visible = false; });
    clip.pause(); clip.seek(0);
  };

  X.update = (t) => {
    if (t > LOOP) { X.start(); return; }
    const out = 1 - smooth01((t - 69.5) / 2.5);

    // --- where is Diana and what is she doing? ---
    let pos = ENTRY, walking = false, idx = -1;
    for (let i = 0; i < PLANT.length; i++) {
      const P = PLANT[i];
      if (t >= P.walk[0]) idx = i;
    }
    if (idx >= 0) {
      const P = PLANT[idx];
      const from = idx === 0 ? ENTRY : SPOTS[idx - 1].p;
      const to = SPOTS[idx].p;
      const k = seg(t, P.walk[0], P.walk[1], easeInOut);
      pos = [lerp(from[0], to[0], k), lerp(from[1], to[1], k)];
      walking = k > 0 && k < 1;
    }
    const bob = walking ? Math.abs(Math.sin(t * 8.5)) * 0.007 : 0;
    girl.position.set(pos[0], pos[1], bob);
    girl.userData.spin.rotation.z = walking ? 0.05 * Math.sin(t * 8.5) : 0;

    // appear from the bushes
    X.once('appear', t, 0.3, () => { appear.trigger(t); clip.pause(); clip.seek(0); });
    appear.update(t);
    // after the last seed she fades into light, leaving the garden to grow
    const lastEnd = PLANT[2].play + VIDEO_LEN / PLANT[2].rate;
    gm.reveal.value = appear.reveal(t, 0.05, 1.2) * (1 - smooth01((t - lastEnd - 0.1) / 1.4));

    // soil mound: hidden while walking, revealed when she arrives
    let clipLow = WALK_V;
    for (let i = 0; i < PLANT.length; i++) {
      const P = PLANT[i];
      const arrive = P.walk[0] + P.walk[1];
      const end = P.play + VIDEO_LEN / P.rate;
      if (t >= arrive && t < end) {
        clipLow = WALK_V * (1 - smooth01((t - arrive) / 0.7));
      }
      X.once('dust' + i, t, arrive, () => { puff.trigger(t, [SPOTS[i].p[0], SPOTS[i].p[1], 0.01]); });
      X.once('play' + i, t, P.play, () => {
        clip.seek(0);
        clip.play(P.rate);
        if (i === 0) X.cueSound('assets/audio/s8_planting.m4a', 0.6);
      });
      const st = stations[i];
      X.once('seed' + i, t, P.play + V_SEED / P.rate, () => { st.seedBurst.trigger(t); st.ring.trigger(t, st.x, st.y); });
      // after the planting: leave the mound + sprout behind and move on
      X.once('leave' + i, t, end, () => {
        st.planted.visible = true;
        st.planted.rotation.z = girl.rotation.z;
        clip.pause();
        clip.seek(0);
        swap.trigger(t, [st.x, st.y, H * 0.5]);
      });
      const covered = smooth01((t - (P.play + V_COVER / P.rate)) / 1.5);
      st.glow.material.opacity = covered * (0.18 + 0.12 * pulse(t, 2.2)) * out;
      const bloom = smooth01((t - (P.play + V_SPROUT / P.rate)) / 1.5) * out;
      st.fx.set(bloom);
      st.fx.update(t);
      st.ripples.forEach((r, j) => {
        const n = Math.floor(t / (1.3 + j * 0.35));
        if (bloom > 0.3 && r.n !== n) { r.n = n; r.trigger(t, st.x + [-0.03, 0.035, 0.0][j], st.y + [0.01, -0.015, 0.03][j]); }
        r.update(t);
      });
      st.seedBurst.update(t);
      st.ring.update(t);
      st.planted.children[0].material.opacity = out;

      // finale: the sprouts grow into flowers
      const gs = 61.5 + i * 0.8;
      st.plant.visible = t > gs;
      if (st.plant.visible) {
        const u = st.plant.userData.mat.uniforms;
        u.frame.value = Math.min(1, (t - gs) / 6) * (grow[SPOTS[i].grow].meta.frames - 1);
        u.opacity.value = smooth01((t - gs) / 0.6) * out;
        u.uBend.value = 0.035 * Math.sin(t * 1.3 + i);
      }
    }
    gm.clipLow.value = clipLow;
    // with the mound hidden, lower her so her shoes touch the paper
    girl.position.z = bob - clipLow * H;
    puff.update(t);
    swap.update(t);

    let msg = '';
    if (window01(t, 1.0, 4.0, 0.5) > 0.5) msg = '“This one is for you, Liam,” I whispered.';
    for (let i = 0; i < 3; i++) {
      const at = PLANT[i].play + V_SPROUT / PLANT[i].rate + 0.3;
      if (window01(t, at, 5.4, 0.5) > 0.5) msg = MSGS[i];
    }
    if (window01(t, 63, 5.5, 0.5) > 0.5) msg = 'After that, I planted more.';
    X.say(msg);
  };
  return X;
}

export const STATIONS = { s8_hole: planting };

/* ---------------- preview stand-ins: the three layers of paper bushes ---------------- */
export async function popup() {
  const T = await loadTextures({ s: 'scene8/bush_small.png', m: 'scene8/bush_medium.png', l: 'scene8/bush_tall.png' });
  const g = new THREE.Group();
  const layers = [[T.l, 0.62, 0.285], [T.m, 0.44, 0.17], [T.s, 0.3, 0.075]];
  layers.forEach(([a, w, y], i) => {
    const c = cutout(a, w, { renderOrder: 1 + i });
    c.position.set(0, y, 0);
    g.add(c);
  });
  return g;
}
