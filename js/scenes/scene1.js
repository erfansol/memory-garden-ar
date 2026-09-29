// Scene 1 — "Memories": three Scan Here icons, three seasons of Diana and Liam
//   sunflower  → summer: the children play with their shadows on the wall
//   umbrellas  → autumn: the swing under the maple tree, in soft rain
//   snowman    → winter: two snow angels, side by side
// Each season arrives with a Sims-style spin (the "costume change") and a burst of light.
import * as THREE from 'three';
import { loadTextures, window01, smooth01, cutout } from '../engine.js';
import { videoPlane } from '../video.js';
import { Particles, GroundRing, TEX, contactShadow } from '../fx.js';
import { Experience, AppearFX } from '../stage.js';

const SUMMER = { x: 0.345, y: 0.075, h: 0.155 };
const AUTUMN = { x: -0.02, y: 0.262, h: 0.3 };
const WINTER = { x: -0.33, y: -0.045, h: 0.4 };

/* ---------------- summer ---------------- */
async function summer() {
  const X = new Experience('s1_spring');
  X.title = 'Scene 1 · Summer';
  const g = X.group;
  const T = await loadTextures({ petal: 'common/petal.png' });
  const clip = await X.clip('s1_spring');
  X.loops.push({ key: 'amb', url: clip.meta.audio, vol: 0.5 });

  const kids = X.billboard(videoPlane(clip, SUMMER.h, { reveal: 0, revealColor: 0xfff1c0, renderOrder: 12 }));
  kids.position.set(SUMMER.x, SUMMER.y, 0);
  g.add(kids);
  const { spin, width } = kids.userData;

  // Their shadows on the wall in front of them: the same moving video, dark, soft,
  // larger and a little further away (as if the sun were behind the viewer)
  const shadow = videoPlane(clip, SUMMER.h * 1.34, { tint: 0x2a221c, tintAmt: 1, opacity: 0, blur: 3, renderOrder: 5 });
  const sMesh = shadow.userData.mesh;
  sMesh.position.set(0.012, 0.075, 0.006);
  spin.add(sMesh);

  // soft contact shadows under each child
  for (const fx of [0.25, 0.73]) {
    const cs = contactShadow(0.07, 0.024, 0.4);
    cs.position.x = (fx - 0.5) * width;
    spin.add(cs);
  }

  const fx = new AppearFX(g, { x: SUMMER.x, y: SUMMER.y, height: SUMMER.h, radius: 0.08 });
  const motes = new Particles(g, {
    count: 22, map: TEX.dot(), size: [0.006, 0.014], mode: 'float', additive: true, twinkle: 0.8,
    colors: [0xfff3c4, 0xffe08a, 0xffffff], sway: 0.03, swayFreq: 0.35, seed: 11,
    box: { x: [SUMMER.x - 0.16, SUMMER.x + 0.16], y: [SUMMER.y - 0.08, SUMMER.y + 0.1], z: [0.03, 0.22] },
  });
  const petals = new Particles(g, {
    count: 10, map: T.petal.tex, size: [0.012, 0.018], mode: 'across', spin: 1.5, seed: 12,
    colors: [0xffffff, 0xfff4d8], speed: [0.03, 0.05], sway: 0.02,
    box: { x: [SUMMER.x - 0.22, SUMMER.x + 0.2], y: [SUMMER.y - 0.1, SUMMER.y + 0.12], z: [0.06, 0.24] },
  });

  X.update = (t) => {
    X.once('go', t, 0.25, () => { fx.trigger(t); clip.play(); });
    fx.update(t);
    spin.rotation.z = fx.spin(t);
    kids.userData.mat.uniforms.reveal.value = fx.reveal(t);
    const sh = smooth01((t - 1.8) / 1.6);
    shadow.userData.mat.uniforms.opacity.value = 0.46 * sh;
    // shadows are a little livelier than the children themselves
    shadow.userData.mat.uniforms.uSkew.value = 0.07 * Math.sin(t * 0.9);
    motes.set(smooth01((t - 1) / 2)); motes.update(t);
    petals.set(smooth01((t - 2) / 2)); petals.update(t);
    X.say(window01(t, 1.4, 4.6, 0.6) > 0.5 ? 'Summer — we played with our shadows on the wall.' : '');
  };
  return X;
}

/* ---------------- autumn ---------------- */
async function autumn() {
  const X = new Experience('s1_autumn');
  X.title = 'Scene 1 · Autumn';
  const g = X.group;
  const T = await loadTextures({ leaf: 'common/leaf.png' });
  const clip = await X.clip('s1_autumn');
  X.loops.push({ key: 'amb', url: clip.meta.audio, vol: 0.5 });

  const tree = X.billboard(videoPlane(clip, AUTUMN.h, { reveal: 0, revealColor: 0xffd29a, renderOrder: 12 }));
  tree.position.set(AUTUMN.x, AUTUMN.y, 0);
  g.add(tree);
  const { spin, width } = tree.userData;
  const cs = contactShadow(width * 0.9, 0.05, 0.3);
  cs.position.x = width * 0.08;
  spin.add(cs);

  const fx = new AppearFX(g, { x: AUTUMN.x, y: AUTUMN.y, height: AUTUMN.h, radius: 0.1, color: 0xffc98a });
  const box = (dx, dy, z) => ({ x: [AUTUMN.x - dx, AUTUMN.x + dx], y: [AUTUMN.y - dy, AUTUMN.y + dy], z });
  const rain = new Particles(g, {
    count: 80, map: TEX.streak(), size: [0.02, 0.034], mode: 'fall', spin: 0, sway: 0.002,
    color: 0xd6e6ff, opacity: 0.42, speed: [0.5, 0.7], wind: [-0.04, 0], seed: 21,
    box: box(0.2, 0.13, [0, 0.36]),
  });
  const leaves = new Particles(g, {
    count: 16, map: T.leaf.tex, size: [0.014, 0.022], mode: 'fall', spin: 2.2, sway: 0.035, swayFreq: 1.1,
    colors: [0xffffff, 0xffd9a0, 0xffb07a], speed: [0.03, 0.055], wind: [0.06, -0.02], seed: 22,
    box: box(0.13, 0.08, [0.005, 0.27]),
  });
  // little rings on the puddles
  const ripples = [];
  for (let i = 0; i < 6; i++) {
    ripples.push({
      r: new GroundRing(g, { size: 0.035 + 0.015 * (i % 3), color: 0xe9f3ff, dur: 1.2 }),
      period: 1.7 + i * 0.37, x: AUTUMN.x + [-0.16, 0.12, -0.07, 0.18, 0.02, -0.2][i],
      y: AUTUMN.y + [-0.06, -0.04, -0.1, 0.05, 0.08, 0.04][i], n: -1,
    });
  }

  X.update = (t) => {
    X.once('go', t, 0.25, () => { fx.trigger(t); clip.play(); });
    fx.update(t);
    spin.rotation.z = fx.spin(t);
    tree.userData.mat.uniforms.reveal.value = fx.reveal(t, 0.1, 1.8);
    const w = smooth01((t - 1.5) / 2.5);
    rain.set(w); rain.update(t);
    leaves.set(w); leaves.update(t);
    for (const p of ripples) {
      const n = Math.floor(t / p.period);
      if (t > 2.5 && n !== p.n) { p.n = n; p.r.trigger(t, p.x, p.y); }
      p.r.update(t);
    }
    X.say(window01(t, 1.6, 4.6, 0.6) > 0.5 ? 'Autumn — the swing, the soft rain, and the two of us.' : '');
  };
  return X;
}

/* ---------------- winter ---------------- */
async function winter() {
  const X = new Experience('s1_winter');
  X.title = 'Scene 1 · Winter';
  const g = X.group;
  const T = await loadTextures({ snow: 'common/snow.png' });
  const clip = await X.clip('s1_winter');
  X.loops.push({ key: 'amb', url: clip.meta.audio, vol: 0.5 });

  // the memory lies on the snowy page like a patch of fresh snow
  const patch = videoPlane(clip, WINTER.h, { standing: false, anchor: 'center', vignette: 0.42, reveal: 0, revealColor: 0xffffff, renderOrder: 3 });
  patch.position.set(WINTER.x, WINTER.y, 0.002);
  g.add(patch);

  const fx = new AppearFX(g, { x: WINTER.x, y: WINTER.y, height: 0.22, radius: 0.09, color: 0xe6f2ff, pillar: false, count: 44 });
  const box = (z) => ({ x: [WINTER.x - 0.17, WINTER.x + 0.17], y: [WINTER.y - 0.23, WINTER.y + 0.25], z });
  const snow = new Particles(g, {
    count: 70, map: T.snow.tex, size: [0.006, 0.013], mode: 'fall', spin: 0.6, sway: 0.014, swayFreq: 0.7,
    speed: [0.022, 0.042], wind: [0.02, 0], seed: 31, box: box([0.004, 0.28]),
  });
  const glints = new Particles(g, {
    count: 20, map: TEX.star(), size: [0.006, 0.013], mode: 'float', additive: true, twinkle: 1, sway: 0.002,
    color: 0xffffff, seed: 32, box: { x: [WINTER.x - 0.1, WINTER.x + 0.1], y: [WINTER.y - 0.16, WINTER.y + 0.16], z: [0.004, 0.008] },
  });

  X.update = (t) => {
    X.once('go', t, 0.25, () => { fx.trigger(t); clip.play(); });
    fx.update(t);
    patch.userData.mat.uniforms.reveal.value = smooth01((t - 0.35) / 2.2);
    snow.set(smooth01((t - 0.2) / 1.5)); snow.update(t);
    glints.set(smooth01((t - 2) / 1.5)); glints.update(t);
    X.say(window01(t, 1.6, 4.6, 0.6) > 0.5 ? 'Winter — two snow angels, side by side.' : '');
  };
  return X;
}

export const STATIONS = { s1_spring: summer, s1_autumn: autumn, s1_winter: winter };

/* ---------------- preview stand-ins for the paper pop-up ---------------- */
export async function popup() {
  const T = await loadTextures({ wall: 'scene1/wall.png' });
  const g = new THREE.Group();
  // the classroom walls fold into a V at the back of the spread
  const brick = brickTexture();
  const H = 0.2;
  const pts = [[-0.22, 0.08], [0, 0.205], [0.21, 0.08]];
  for (let i = 0; i < 2; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const tex = T.wall.tex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(0.5, 1);
    tex.offset.set(i * 0.5, 0);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide }));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshBasicMaterial({ map: brick, side: THREE.BackSide }));
    for (const m of [front, back]) {
      m.geometry.translate(0, H / 2, 0);
      m.rotation.x = Math.PI / 2;
      const piv = new THREE.Group();
      piv.add(m);
      piv.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
      piv.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
      g.add(piv);
    }
  }
  return g;
}

function brickTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#c9b8a8'; x.fillRect(0, 0, 256, 128);
  for (let r = 0; r < 8; r++) {
    for (let k = -1; k < 9; k++) {
      const off = (r % 2) * 16;
      x.fillStyle = `hsl(${20 + (k * 7 + r * 3) % 10}, 18%, ${62 + ((k * 13 + r * 7) % 9)}%)`;
      x.fillRect(k * 32 + off + 1, r * 16 + 1, 30, 14);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1.5, 1.5);
  return t;
}
