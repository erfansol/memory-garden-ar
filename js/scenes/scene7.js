// Scene 7 — "The Doll". Scanning the bunny starts this sequence:
//   1. the window opens
//   2. the wind blows (you can hear it)
//   3. drawings on the desk are blown off and fall to the floor
//   4. a paper plane flies out of the window and lands on the "Scan Me" bunny
//   5. Diana appears in the middle, standing with her doll in her arms, sits down and
//      plays with it; a sentence appears above her head and the sitting/playing loops
import * as THREE from 'three';
import { loadTextures, window01, smooth01, seg, easeInOut, pulse, cutout } from '../engine.js';
import { videoPlane } from '../video.js';
import { Particles, PaperPlane, WindRibbon, TEX, bezier, contactShadow, drawingTexture, flatSprite } from '../fx.js';
import { Experience, AppearFX } from '../stage.js';
import { px } from '../layout.js';
import { sound } from '../sound.js';

// the printed window on the back wall (left wall segment of the pop-up)
const WIN = { x: -0.119, y: 0.204, z: 0.198, w: 0.24, rot: -0.32 };
// the desk under the window, and the height of its top
const DESK = { x: -0.17, y: 0.19, top: 0.094, w: 0.16 };
const RUG = { x: 0.0, y: -0.05 };
const SCAN_ME = px(2985, 1420);        // between the printed bunny and its "Scan Me" label
const GIRL_H = 0.3;
const HEAD_SITTING = 0.64;             // top of her head when sitting, as a fraction of GIRL_H
const T_WIND = 3.6, T_PLANE = 9.2, T_GIRL = 13.8, T_WORDS = 17.6;
const WORDS = ['“You are not alone.”', '“I am here. You can rest now.”'];

async function doll() {
  const X = new Experience('s7_bunny');
  X.title = 'Scene 7 · The Doll';
  const g = X.group;
  const T = await loadTextures({ plane: 'common/paperplane.png', heart: 'common/heart.png', glow: 'common/glow.png' });
  const [winClip, girlClip] = await Promise.all([X.clip('s7_window'), X.clip('s7_girl')]);

  /* 1. the window */
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

  /* 2. the wind: streaks of air pouring in through the window */
  const breeze = [0, 1, 2, 3, 4, 5].map((i) => new WindRibbon(g, bezier(
    along(-0.06 + i * 0.025, -0.03 + (i % 2) * 0.02),
    [WIN.x - 0.04 + i * 0.03, WIN.y - 0.1, 0.17 - i * 0.012],
    [-0.2 + i * 0.06, 0.02 - i * 0.02, 0.1 + 0.02 * (i % 3)],
    [-0.36 + i * 0.12, -0.12 + i * 0.012, 0.04 + 0.015 * i],
  ), { width: 0.0075, len: 0.42, opacity: 0.8 }));

  /* 3. drawings lying on the desk are blown off and fall to the floor */
  const sheets = [];
  for (let i = 0; i < 5; i++) {
    const m = flatSprite(drawingTexture(i + 1), 0.042, 0.042, { renderOrder: 20 });
    g.add(m);
    const rest = [DESK.x - 0.05 + i * 0.024, DESK.y - 0.012 * (i % 2), DESK.top + i * 0.0015];
    const land = [-0.35 + i * 0.045 + (i % 2) * 0.015, -0.075 + ((i * 37) % 5) * 0.03, 0.004 + i * 0.0006];
    sheets.push({
      m, rest, start: T_WIND + 0.5 + i * 0.5, dur: 3.2 + (i % 3) * 0.45, rz: -0.5 + i * 0.4,
      path: bezier(rest, [rest[0] + 0.02, rest[1] - 0.06, rest[2] + 0.07], [land[0] + 0.07, land[1] + 0.05, 0.1], land),
    });
  }

  /* 4. the paper plane flies out of the window and lands on "Scan Me" */
  const plane = new PaperPlane(g, T.plane.tex, { size: 0.05 });
  const planePath = bezier(along(0.03, -0.02), [0.04, 0.17, 0.3], [0.3, 0.03, 0.16], [SCAN_ME[0], SCAN_ME[1], 0.008]);
  const landed = flatSprite(T.plane.tex, 0.05, 0.05 * (T.plane.h / T.plane.w), { renderOrder: 21, opacity: 0 });
  landed.position.set(SCAN_ME[0], SCAN_ME[1], 0.004);
  landed.rotation.z = -0.55;
  g.add(landed);
  const touch = new AppearFX(g, { x: SCAN_ME[0], y: SCAN_ME[1], height: 0.04, radius: 0.03, pillar: false, count: 18 });

  /* 5. Diana, her doll, and her words */
  const girl = X.billboard(videoPlane(girlClip, GIRL_H, { reveal: 0, revealColor: 0xffe2b0, renderOrder: 12 }));
  girl.position.set(RUG.x, RUG.y, 0);
  girl.visible = false;
  girl.userData.spin.add(contactShadow(0.1, 0.035, 0.4));
  g.add(girl);
  const appear = new AppearFX(g, { x: RUG.x, y: RUG.y, height: GIRL_H * 0.6, radius: 0.07 });
  const warm = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow.tex, color: 0xffd9a8, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  warm.position.set(RUG.x, RUG.y + 0.012, 0.11);
  warm.scale.set(0.2, 0.2, 1);
  warm.renderOrder = 8;
  g.add(warm);
  const hearts = new Particles(g, {
    count: 8, map: T.heart.tex, size: [0.013, 0.022], mode: 'rise', spin: 0.4, sway: 0.02, swayFreq: 0.9,
    speed: [0.03, 0.045], seed: 71, colors: [0xffffff, 0xffe0e6], renderOrder: 11,
    box: { x: [RUG.x - 0.09, RUG.x + 0.09], y: [RUG.y + 0.03, RUG.y + 0.05], z: [0.12, 0.34] },
  });

  X.onRestart = () => { girl.visible = false; };

  X.update = (t, camera) => {
    // 1
    X.once('win', t, 1.0, () => { winClip.play(); X.cueSound(winClip.meta.audio, 0.45); });
    win.userData.mat.uniforms.reveal.value = smooth01((t - 0.2) / 1.1);
    moon.material.opacity = smooth01((t - 3.8) / 1.5) * (0.55 + 0.25 * pulse(t, 3.5));

    // 2
    X.once('wind', t, T_WIND, () => sound.wind(6.5, 0.55));
    breeze.forEach((r, i) => {
      const s = T_WIND + i * 0.4 + (i % 2) * 1.9;
      r.update(((t - s) / 2.2) * 1.42, window01(t, T_WIND, 6, 0.5));
    });

    // 3
    for (const s of sheets) {
      const k = seg(t, s.start, s.dur, (x) => 1 - Math.pow(1 - x, 1.5));
      const p = s.path(k);
      const flying = k > 0 && k < 1;
      const flutter = flying ? 0.01 * Math.sin(t * 6 + s.rz * 3) : 0;
      // before the gust the papers tremble a little on the desk
      const tremble = t > T_WIND && k === 0 ? 0.004 * Math.sin(t * 30 + s.rz * 5) : 0;
      s.m.position.set(p[0] + flutter, p[1], p[2] + Math.abs(tremble));
      const tumble = Math.sin(Math.PI * k);
      s.m.rotation.set(tumble * 1.2 * Math.sin(t * 3.1 + s.rz), tumble * 0.9 * Math.sin(t * 2.3 + s.rz * 2), s.rz + k * 2.2);
      s.m.material.opacity = smooth01((t - 0.4) / 0.6);
    }

    // 4
    const kp = seg(t, T_PLANE, 3.8, easeInOut);
    plane.update(t, kp, planePath, window01(t, T_PLANE, 3.85, 0.25), camera);
    X.once('land', t, T_PLANE + 3.75, () => touch.trigger(t));
    touch.update(t);
    landed.material.opacity = smooth01((t - T_PLANE - 3.7) / 0.3);

    // 5
    X.once('girl', t, T_GIRL, () => {
      girl.visible = true;
      appear.trigger(t);
      girlClip.play();
      X.cueSound(girlClip.meta.audio, 0.55);
    });
    appear.update(t);
    girl.userData.mat.uniforms.reveal.value = appear.reveal(t, 0.05, 1.3);
    const sitting = smooth01((t - T_WORDS + 0.5) / 1.5);
    warm.material.opacity = sitting * (0.3 + 0.15 * pulse(t, 3));
    hearts.set(sitting);
    hearts.update(t);

    // her words float above her head, and come back every half minute while she plays
    let words = '';
    if (t > T_WORDS) {
      const c = (t - T_WORDS) % 30;
      if (c < 6) words = WORDS[0];
      else if (c > 6.8 && c < 13) words = WORDS[1];
    }
    X.sayAbove(words, girl.userData.mesh, [0, GIRL_H * HEAD_SITTING, 0]);
    X.say(window01(t, T_WIND + 0.2, 4.6, 0.5) > 0.5 ? 'A soft breeze drifts in through the open window…' : '');
  };
  return X;
}

export const STATIONS = { s7_bunny: doll };

/* ---------------- preview stand-ins for the paper pop-up ---------------- */
export async function popup() {
  const T = await loadTextures({ wall: 'scene7/wall.png', bed: 'scene7/bed.png', desk: 'scene7/desk.png' });
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
  const desk = cutout(T.desk, DESK.w, { renderOrder: 2 });
  desk.position.set(DESK.x, DESK.y + 0.012, 0);
  const bed = cutout(T.bed, 0.24, { renderOrder: 2 });
  bed.position.set(0.19, 0.14, 0);
  g.add(desk, bed);
  return g;
}
