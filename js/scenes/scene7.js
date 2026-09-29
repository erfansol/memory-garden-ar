// Scene 7 — "The Doll": scanning the bunny opens the night window. A breeze scatters
// Diana's drawings, a paper plane glides to the bunny, and Diana — holding it —
// sits on the rug and hugs it close: "You are not alone."
import * as THREE from 'three';
import { loadTextures, window01, smooth01, seg, lerp, easeInOut, easeOut, pulse, cutout } from '../engine.js';
import { videoPlane } from '../video.js';
import { Particles, GroundRing, PaperPlane, WindRibbon, TEX, bezier, contactShadow, drawingTexture, flatSprite } from '../fx.js';
import { Experience, AppearFX } from '../stage.js';
import { px } from '../layout.js';

const LOOP = 42;
// the printed window on the back wall (left wall segment of the pop-up)
const WIN = { x: -0.119, y: 0.204, z: 0.198, w: 0.24, rot: -0.32 };
const RUG = { x: 0.0, y: -0.05 };
const BUNNY = px(2805, 1515);
const GIRL_H = 0.3;

async function doll() {
  const X = new Experience('s7_bunny');
  X.title = 'Scene 7 · The Doll';
  const g = X.group;
  const T = await loadTextures({ plane: 'common/paperplane.png', heart: 'common/heart.png', glow: 'common/glow.png' });
  const [winClip, girlClip] = await Promise.all([X.clip('s7_window'), X.clip('s7_girl')]);

  /* the window opens */
  const win = videoPlane(winClip, WIN.w / winClip.meta.aspect, { anchor: 'center', reveal: 0, revealColor: 0xcfe0ff, renderOrder: 4 });
  win.position.set(WIN.x - 0.31 * 0.004, WIN.y - 0.95 * 0.004, WIN.z);
  win.rotation.z = WIN.rot;
  g.add(win);
  const along = (d, dz = 0) => [WIN.x + Math.cos(WIN.rot) * d, WIN.y + Math.sin(WIN.rot) * d - 0.01, WIN.z + dz];
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow.tex, color: 0xfff2c4, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  moon.position.set(...along(WIN.w * 0.28, 0.025));
  moon.scale.set(0.09, 0.09, 1);
  moon.renderOrder = 6;
  g.add(moon);

  /* the breeze */
  const breeze = [0, 1, 2, 3, 4].map((i) => new WindRibbon(g, bezier(
    along(-0.03 + i * 0.03, -0.03),
    [WIN.x - 0.05 + i * 0.05, WIN.y - 0.12, 0.2 - i * 0.02],
    [-0.12 + i * 0.1, -0.02 - i * 0.02, 0.1 + 0.03 * (i % 2)],
    [-0.28 + i * 0.16, -0.14 + i * 0.01, 0.05 + 0.02 * i],
  ), { width: 0.005, len: 0.4, opacity: 0.55 }));

  /* loose drawings flutter down to the floor (arrow 1 in the storyboard) */
  const sheets = [];
  for (let i = 0; i < 5; i++) {
    const m = flatSprite(drawingTexture(i + 1), 0.05, 0.05, { renderOrder: 20 });
    m.material.transparent = true;
    g.add(m);
    const land = [-0.36 + i * 0.045 + (i % 2) * 0.02, -0.06 + ((i * 37) % 5) * 0.028];
    sheets.push({
      m, start: 3.4 + i * 0.55, dur: 3.4 + (i % 3) * 0.4, rz: -0.6 + i * 0.35,
      path: bezier(along(-0.05 + i * 0.02, -0.05), [WIN.x - 0.12, WIN.y - 0.05, 0.22], [land[0] + 0.06, land[1] + 0.04, 0.09], [land[0], land[1], 0.004 + i * 0.0006]),
    });
  }

  /* the paper plane glides to the bunny (arrow 2) */
  const plane = new PaperPlane(g, T.plane.tex, { size: 0.05 });
  const planePath = bezier(along(0.04, -0.02), [0.02, 0.2, 0.26], [0.2, 0.06, 0.16], [BUNNY[0] - 0.045, BUNNY[1] + 0.02, 0.012]);
  const land = new AppearFX(g, { x: BUNNY[0] - 0.045, y: BUNNY[1] + 0.02, height: 0.05, radius: 0.03, pillar: false, count: 16 });

  /* the bunny calls softly */
  const call = [0, 1, 2].map(() => new GroundRing(g, { size: 0.16, color: 0xffe0b0, dur: 1.6 }));
  const bunnyGlow = flatSprite(TEX.dot(), 0.14, 0.14, { additive: true, color: 0xffe7c0, opacity: 0 });
  bunnyGlow.position.set(BUNNY[0], BUNNY[1], 0.003);
  g.add(bunnyGlow);
  // a path of light from the bunny to the middle of the rug
  const stream = new Particles(g, { count: 26, map: TEX.star(), size: [0.008, 0.016], additive: true, mode: 'float', sway: 0, colors: [0xfff2c8, 0xffffff] });
  const streamPath = bezier([BUNNY[0], BUNNY[1], 0.03], [0.2, -0.02, 0.12], [0.08, -0.06, 0.1], [RUG.x, RUG.y, 0.06]);

  /* Diana */
  const girl = X.billboard(videoPlane(girlClip, GIRL_H, { reveal: 0, revealColor: 0xffe2b0, renderOrder: 12 }));
  girl.position.set(RUG.x, RUG.y, 0);
  girl.visible = false;
  g.add(girl);
  girl.userData.spin.add(Object.assign(contactShadow(0.1, 0.035, 0.4), {}));
  const appear = new AppearFX(g, { x: RUG.x, y: RUG.y, height: GIRL_H * 0.6, radius: 0.07 });
  const warm = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow.tex, color: 0xffd9a8, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  warm.position.set(RUG.x, RUG.y + 0.012, 0.11);
  warm.scale.set(0.2, 0.2, 1);
  warm.renderOrder = 8;
  g.add(warm);
  const hearts = new Particles(g, {
    count: 9, map: T.heart.tex, size: [0.014, 0.024], mode: 'rise', spin: 0.4, sway: 0.02, swayFreq: 0.9,
    speed: [0.035, 0.05], seed: 71, colors: [0xffffff, 0xffe0e6],
    box: { x: [RUG.x - 0.09, RUG.x + 0.09], y: [RUG.y + 0.03, RUG.y + 0.05], z: [0.12, 0.36] },
  });

  X.onRestart = () => { girl.visible = false; };

  X.update = (t, camera) => {
    if (t > LOOP) { X.start(); return; }
    const out = 1 - smooth01((t - 36) / 2.5);           // everything melts away before the loop restarts

    // window
    X.once('win', t, 1.0, () => { winClip.play(); X.cueSound(winClip.meta.audio, 0.5); });
    win.userData.mat.uniforms.reveal.value = smooth01((t - 0.2) / 1.1) * out;
    moon.material.opacity = smooth01((t - 3.8) / 1.5) * (0.55 + 0.25 * pulse(t, 3.5)) * out;

    // breeze + drawings
    breeze.forEach((r, i) => {
      const s = 3.0 + i * 0.45 + (i % 2) * 2.4;
      r.update(((t - s) / 2.4) * 1.4, window01(t, 3, 7, 0.5) * out);
    });
    for (const s of sheets) {
      const k = seg(t, s.start, s.dur, (x) => 1 - Math.pow(1 - x, 1.6));
      const p = s.path(k);
      const flutter = (1 - k) * 0.012 * Math.sin(t * 6 + s.rz * 3);
      s.m.position.set(p[0] + flutter, p[1], p[2] + flutter * 0.5);
      const tumble = 1 - smooth01((k - 0.7) / 0.3);
      s.m.rotation.set(tumble * 1.1 * Math.sin(t * 3.1 + s.rz), tumble * 0.9 * Math.sin(t * 2.3 + s.rz * 2), s.rz + (1 - k) * 2);
      s.m.material.opacity = smooth01((t - s.start) / 0.3) * out;
      s.m.visible = t > s.start;
    }

    // paper plane
    const kp = seg(t, 5.0, 4.0, easeInOut);
    plane.update(t, kp, planePath, window01(t, 5.0, 4.1, 0.3) * out, camera);
    X.once('land', t, 9.0, () => land.trigger(t));
    land.update(t);

    // the bunny calls, and a path of light leads to the rug
    call.forEach((r, i) => {
      X.once('call' + i, t, 8.8 + i * 0.7, () => r.trigger(t, BUNNY[0], BUNNY[1]));
      r.update(t);
    });
    bunnyGlow.material.opacity = window01(t, 8.6, 3.2, 0.8) * (0.4 + 0.3 * pulse(t, 1.4));
    const sk = seg(t, 9.4, 1.8, easeInOut);
    const sv = window01(t, 9.4, 2.2, 0.4);
    stream.set(sv);
    if (sv > 0) {
      const pos = stream.points.geometry.attributes.position.array;
      const al = stream.points.geometry.attributes.aAlpha.array;
      stream.items.forEach((it, i) => {
        const k = sk - (i / stream.items.length) * 0.35;
        const p = streamPath(Math.max(0, Math.min(1, k)));
        pos.set([p[0] + 0.008 * Math.sin(t * 5 + i), p[1], p[2] + 0.008 * Math.cos(t * 4 + i)], i * 3);
        al[i] = k > 0 && k < 1 ? sv * (1 - i / stream.items.length) : 0;
      });
      stream.points.geometry.attributes.position.needsUpdate = true;
      stream.points.geometry.attributes.aAlpha.needsUpdate = true;
    }

    // Diana appears with the bunny in her arms, sits down and hugs it
    X.once('girl', t, 10.8, () => {
      girl.visible = true;
      appear.trigger(t);
      girlClip.play();
      X.cueSound(girlClip.meta.audio, 0.55);
    });
    appear.update(t);
    girl.userData.mat.uniforms.reveal.value = appear.reveal(t, 0.05, 1.3) * out;
    const hug = smooth01((t - 15.2) / 1.5);
    warm.material.opacity = hug * (0.3 + 0.15 * pulse(t, 3)) * out;
    hearts.set(hug * out);
    hearts.update(t);

    let msg = '';
    if (window01(t, 3.6, 4.4, 0.5) > 0.5) msg = 'A soft breeze drifts in through the open window…';
    else if (window01(t, 15.4, 4.8, 0.5) > 0.5) msg = '“You are not alone.”';
    else if (window01(t, 20.8, 5.2, 0.5) > 0.5) msg = '“I am here. You can rest now.”';
    X.say(msg);
  };
  return X;
}

export const STATIONS = { s7_bunny: doll };

/* ---------------- preview stand-ins for the paper pop-up ---------------- */
export async function popup() {
  const T = await loadTextures({ wall: 'scene7/wall.png', bed: 'scene7/bed.png' });
  const g = new THREE.Group();
  const pts = [[-0.29, 0.265], [0.0, 0.1685], [0.32, 0.276]];
  const lens = [0, 1].map((i) => Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
  const total = lens[0] + lens[1];
  const H = total * (T.wall.h / T.wall.w);
  for (let i = 0; i < 2; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const tex = T.wall.tex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(lens[i] / total, 1);
    tex.offset.set(i ? lens[0] / total : 0, 0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(lens[i], H), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true }));
    m.geometry.translate(0, H / 2, 0);
    m.rotation.x = Math.PI / 2;
    const piv = new THREE.Group();
    piv.add(m);
    piv.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
    piv.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
    g.add(piv);
  }
  const bed = cutout(T.bed, 0.24, { renderOrder: 2 });
  bed.position.set(0.19, 0.14, 0);
  g.add(bed);
  return g;
}
