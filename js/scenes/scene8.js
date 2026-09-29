// Scene 8 — "Planting Seeds": Diana appears three times, in three places on the page,
// and plants a seed each time (the same animation). Every seed answers with a soft
// light and a tiny sprout, a sentence appears above her head, and each planting has its
// own weather around her: flower petals, then orange autumn leaves, then snow.
import * as THREE from 'three';
import { loadTextures, window01, smooth01, pulse, cutout } from '../engine.js';
import { videoPlane } from '../video.js';
import { Particles, GroundRing, TEX, contactShadow, flatSprite } from '../fx.js';
import { Experience, AppearFX } from '../stage.js';
import { px } from '../layout.js';

const H = 0.27;                       // height of the video cut-out (girl + soil mound)
const MOUND_V = 0.2222;               // everything below this (in the last frame) is the soil mound
const HEAD_V = 0.97;                  // top of her head when standing
const VIDEO_LEN = 21.0;
const V_SEED = 9.5, V_COVER = 14.0, V_SPROUT = 16.6;   // moments inside the video
const SPOTS = [
  { p: px(2874, 1467), weather: 'petals' },   // the printed hole with the seed
  { p: [0.02, -0.04], weather: 'leaves' },
  { p: [-0.25, 0.09], weather: 'snow' },
];
const START = [0.6, 24.6, 48.6];      // when she appears at each spot
const PLAY_DELAY = 0.6;
const FINALE = 71, LOOP = 80;
const WORDS = [
  '“I can’t bring you back, but I can keep your memory with kindness.”',
  '“Every time I remember you, something small grows inside me.”',
  '“Memories don’t end; they only change their shape.”',
];

async function planting() {
  const X = new Experience('s8_hole');
  X.title = 'Scene 8 · Planting Seeds';
  const g = X.group;
  const T = await loadTextures({ planted: 'scene8/planted.png', petal: 'common/petal.png', leaf: 'common/leaf.png', snow: 'common/snow.png' });
  const clip = await X.clip('s8_girl');

  const girl = X.billboard(videoPlane(clip, H, { reveal: 0, revealColor: 0xffe7b8, renderOrder: 14 }));
  const gm = girl.userData.mat.uniforms;
  girl.userData.spin.add(contactShadow(0.1, 0.03, 0.35));
  girl.visible = false;
  g.add(girl);

  const stations = SPOTS.map((s) => {
    const [x, y] = s.p;
    const appear = new AppearFX(g, { x, y, height: H * 0.7, radius: 0.06 });
    const planted = X.billboard(new THREE.Group());
    planted.add(cutout(T.planted, H * clip.meta.aspect, { renderOrder: 10 }));
    planted.position.set(x, y, 0);
    planted.visible = false;
    g.add(planted);
    const glow = flatSprite(TEX.dot(), 0.1, 0.06, { additive: true, color: 0xffd98a, opacity: 0 });
    glow.position.set(x, y, 0.003);
    g.add(glow);
    const seedBurst = new Particles(g, { count: 16, map: TEX.star(), size: [0.008, 0.018], mode: 'burst', additive: true, center: [x, y, 0.02], burstSpeed: [0.02, 0.06], life: [0.8, 1.4], colors: [0xffffff, 0xffe9a8] });
    const ring = new GroundRing(g, { size: 0.14, color: 0xffe4a8, dur: 1.8 });
    const box = { x: [x - 0.1, x + 0.1], y: [y - 0.06, y + 0.06], z: [0.005, 0.3] };
    let weather;
    if (s.weather === 'petals') {
      weather = new Particles(g, { count: 22, map: T.petal.tex, size: [0.011, 0.018], mode: 'fall', spin: 1.8, sway: 0.03, swayFreq: 0.8, speed: [0.025, 0.04], wind: [0.03, 0], colors: [0xffffff, 0xffe4ee, 0xfff4f8], box, seed: 81 });
    } else if (s.weather === 'leaves') {
      weather = new Particles(g, { count: 18, map: T.leaf.tex, size: [0.013, 0.021], mode: 'fall', spin: 2.4, sway: 0.035, swayFreq: 1.1, speed: [0.035, 0.055], wind: [0.04, -0.01], colors: [0xffffff, 0xffc88a, 0xff9f5a], box, seed: 82 });
    } else {
      weather = new Particles(g, { count: 34, map: T.snow.tex, size: [0.006, 0.012], mode: 'fall', spin: 0.6, sway: 0.012, swayFreq: 0.7, speed: [0.02, 0.035], wind: [0.015, 0], color: 0xffffff, box, seed: 83 });
    }
    return { x, y, appear, planted, glow, seedBurst, ring, weather };
  });

  X.onRestart = () => {
    stations.forEach((s) => { s.planted.visible = false; });
    girl.visible = false;
    clip.pause(); clip.seek(0);
  };

  X.update = (t) => {
    if (t > LOOP) { X.start(); return; }
    const out = 1 - smooth01((t - (LOOP - 3)) / 2.5);

    // which planting is happening now?
    let cur = -1;
    for (let i = 0; i < START.length; i++) if (t >= START[i]) cur = i;
    let words = '';
    let reveal = 0, clipLow = 0;

    stations.forEach((st, i) => {
      const t0 = START[i], play = t0 + PLAY_DELAY, end = play + VIDEO_LEN;
      // she appears at this spot
      X.once('appear' + i, t, t0, () => {
        girl.position.set(st.x, st.y, 0);
        girl.visible = true;
        clip.pause(); clip.seek(0);
        st.appear.trigger(t);
      });
      X.once('play' + i, t, play, () => {
        clip.seek(0);
        clip.play(1);
        X.cueSound('assets/audio/s8_planting.m4a', 0.6);
      });
      X.once('seed' + i, t, play + V_SEED, () => { st.seedBurst.trigger(t); st.ring.trigger(t, st.x, st.y); });
      // when she is done, the mound + sprout stay while she fades into light
      X.once('leave' + i, t, end, () => { st.planted.visible = true; st.planted.rotation.copy(girl.rotation); });
      if (i === cur) {
        reveal = st.appear.reveal(t, 0.05, 1.2) * (1 - smooth01((t - end) / 1.3));
        if (t >= end) clipLow = MOUND_V;
        const sprout = play + V_SPROUT;
        if (t > sprout + 0.3 && t < end + 0.6) words = WORDS[i];
      }
      st.appear.update(t);
      st.seedBurst.update(t);
      st.ring.update(t);
      st.glow.material.opacity = smooth01((t - play - V_COVER) / 1.5) * (0.18 + 0.12 * pulse(t, 2.2)) * out;
      st.planted.children[0].material.opacity = out;
      // her weather: flower petals / autumn leaves / snow, only while she is here
      st.weather.set(smooth01((t - t0) / 1.5) * (1 - smooth01((t - end - 0.5) / 2)));
      st.weather.update(t);
    });
    gm.reveal.value = reveal;
    gm.clipLow.value = clipLow;
    if (cur >= 0 && t > START[cur] + PLAY_DELAY + VIDEO_LEN + 1.4) girl.visible = false;

    X.sayAbove(words, girl.userData.mesh, [0, H * HEAD_V, 0]);
    let msg = '';
    if (window01(t, 0.8, 4.2, 0.5) > 0.5) msg = '“This one is for you, Liam,” I whispered.';
    if (window01(t, FINALE, 6, 0.5) > 0.5) msg = 'After that, I planted more.';
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
