// Scene 1 — "Memories": three Scan Here icons, three seasons of Diana and Liam, each
// seen from its own side of the classroom pop-up (see Farnaz's SC1_* mockups):
//   sunflower  → summer: beside the right wall, the children's shadows play on its outside
//   umbrellas  → autumn: behind the back wall (seen from the top edge of the book), the
//                swing under the maple tree in soft rain
//   snowman    → winter: two snow angels lying in the snow over the printed outlines
// Everything is fixed to the paper and the walls: nothing turns to follow the camera.
// Each season arrives with a Sims-style spin (the "costume change") and a burst of light.
import * as THREE from 'three';
import { loadTextures, window01, smooth01 } from '../engine.js';
import { videoPlane } from '../video.js';
import { Particles, GroundRing, TEX, contactShadow } from '../fx.js';
import { Experience, AppearFX } from '../stage.js';

/* ---------------- the classroom pop-up (page units) ----------------
   Three walls, like the inside of a cube: the centre wall faces the reader, the side
   walls open out from the fold lines at SIDE_ANGLE to it. Sizes come from the print
   sheet (tools/prepare_wall.py prints them). */
const WALL = {
  y: 0.19,                                   // base line of the centre wall
  u: [0, 0.33, 0.6712, 1],                   // fold lines in the wall texture
  widths: [0.3179, 0.3286, 0.3167],          // left, centre, right
  height: 0.3523,                            // at the fold lines
  sideHeight: 0.2052,                        // at the outer edges
};
const SIDE_ANGLE = 105 * (Math.PI / 180);    // between a side wall and the centre wall
const HALF = WALL.widths[1] / 2;
const OPEN = Math.PI - SIDE_ANGLE;           // how far a side wall turns towards the reader
// right wall: from its fold line (corner) towards the reader
const R = {
  corner: [HALF, WALL.y],
  dir: [Math.cos(OPEN), -Math.sin(OPEN)],    // along the wall, towards its outer edge
  out: [Math.sin(OPEN), Math.cos(OPEN)],     // its outside face points this way
};
const facing = (n) => Math.atan2(n[0], -n[1]);           // rotation.z that turns a picture to face n
const onRight = (s, d) => [R.corner[0] + R.dir[0] * s + R.out[0] * d, R.corner[1] + R.dir[1] * s + R.out[1] * d];

// sizes balanced so the three seasons read at a similar scale (Farnaz's review)
const SUMMER = { s: 0.16, d: 0.14, h: 0.155, shadowH: 0.19 };
const AUTUMN = { x: -0.02, y: 0.262, h: 0.3 };           // Farnaz's brown line, behind the back wall
const WINTER = { x: -0.345, y: 0.02, h: 0.36 };          // over the printed snow-angel outlines

/* ---------------- summer ---------------- */
async function summer() {
  const X = new Experience('s1_spring');
  X.title = 'Scene 1 · Summer';
  const g = X.group;
  const T = await loadTextures({ petal: 'common/petal.png' });
  const clip = await X.clip('s1_spring');
  X.loops.push({ key: 'amb', url: clip.meta.audio, vol: 0.5 });
  const turn = facing(R.out);

  // the children stand beside the right wall, looking at it (we see them from behind)
  const kids = X.ground(videoPlane(clip, SUMMER.h, { reveal: 0, revealColor: 0xfff1c0, renderOrder: 12 }));
  const [kx, ky] = onRight(SUMMER.s, SUMMER.d);
  kids.position.set(kx, ky, 0);
  kids.rotation.z = turn;
  g.add(kids);
  const { spin, width } = kids.userData;
  for (const fx of [0.25, 0.73]) {
    const cs = contactShadow(0.06, 0.02, 0.4);
    cs.position.x = (fx - 0.5) * width;
    spin.add(cs);
  }

  // …and their shadows play on the outside of the wall: the same moving picture, dark and soft
  const shadow = X.ground(videoPlane(clip, SUMMER.shadowH, { tint: 0x2a221c, tintAmt: 1, opacity: 0, blur: 3, renderOrder: 5 }));
  const [sx, sy] = onRight(SUMMER.s, 0.004);
  shadow.position.set(sx, sy, 0);
  shadow.rotation.z = turn;
  g.add(shadow);

  const fx = new AppearFX(g, { x: kx, y: ky, height: SUMMER.h, radius: 0.07 });
  const motes = new Particles(g, {
    count: 22, map: TEX.dot(), size: [0.006, 0.014], mode: 'float', additive: true, twinkle: 0.8,
    colors: [0xfff3c4, 0xffe08a, 0xffffff], sway: 0.03, swayFreq: 0.35, seed: 11,
    box: { x: [kx - 0.12, kx + 0.12], y: [ky - 0.12, ky + 0.12], z: [0.03, 0.22] },
  });
  const petals = new Particles(g, {
    count: 10, map: T.petal.tex, size: [0.012, 0.018], mode: 'across', spin: 1.5, seed: 12,
    colors: [0xffffff, 0xfff4d8], speed: [0.03, 0.05], sway: 0.02,
    box: { x: [kx - 0.18, kx + 0.14], y: [ky - 0.14, ky + 0.14], z: [0.06, 0.24] },
  });

  X.update = (t) => {
    X.once('go', t, 0.25, () => { fx.trigger(t); clip.play(); });
    fx.update(t);
    spin.rotation.z = fx.spin(t);
    kids.userData.mat.uniforms.reveal.value = fx.reveal(t);
    const sh = smooth01((t - 1.8) / 1.6);
    shadow.userData.mat.uniforms.opacity.value = 0.5 * sh;
    // the shadows are a little livelier than the children themselves
    shadow.userData.mat.uniforms.uSkew.value = 0.06 * Math.sin(t * 0.9);
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

  // the tree stands against the back of the classroom, facing the top edge of the book
  const tree = X.ground(videoPlane(clip, AUTUMN.h, { reveal: 0, revealColor: 0xffd29a, renderOrder: 12 }));
  tree.position.set(AUTUMN.x, AUTUMN.y, 0);
  tree.rotation.z = Math.PI;
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
    box: { x: [AUTUMN.x - 0.22, AUTUMN.x + 0.22], y: [WALL.y + 0.02, AUTUMN.y + 0.08], z: [0, 0.42] },
  });
  const leaves = new Particles(g, {
    count: 16, map: T.leaf.tex, size: [0.014, 0.022], mode: 'fall', spin: 2.2, sway: 0.035, swayFreq: 1.1,
    colors: [0xffffff, 0xffd9a0, 0xffb07a], speed: [0.03, 0.055], wind: [0.06, 0.02], seed: 22,
    box: box(0.15, 0.05, [0.005, 0.33]),
  });
  // little rings on the puddles
  const ripples = [];
  for (let i = 0; i < 6; i++) {
    ripples.push({
      r: new GroundRing(g, { size: 0.035 + 0.015 * (i % 3), color: 0xe9f3ff, dur: 1.2, strength: 0.3 }),
      period: 1.7 + i * 0.37, x: AUTUMN.x + [-0.18, 0.14, -0.08, 0.2, 0.03, -0.22][i],
      y: AUTUMN.y + [0.03, 0.05, 0.07, 0.02, 0.06, 0.0][i], n: -1,
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
  const snow = new Particles(g, {
    count: 70, map: T.snow.tex, size: [0.006, 0.013], mode: 'fall', spin: 0.6, sway: 0.014, swayFreq: 0.7,
    speed: [0.022, 0.042], wind: [0.02, 0], seed: 31,
    box: { x: [WINTER.x - 0.16, WINTER.x + 0.16], y: [WINTER.y - 0.2, WINTER.y + 0.2], z: [0.004, 0.28] },
  });
  const glints = new Particles(g, {
    count: 20, map: TEX.star(), size: [0.006, 0.013], mode: 'float', additive: true, twinkle: 1, sway: 0.002,
    color: 0xffffff, seed: 32, box: { x: [WINTER.x - 0.09, WINTER.x + 0.09], y: [WINTER.y - 0.13, WINTER.y + 0.13], z: [0.004, 0.008] },
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

/* ---------------- preview stand-in for the paper pop-up ----------------
   The classroom: the printed wall inside, brick outside, folded into three walls. */
export async function popup() {
  const T = await loadTextures({ wall: 'scene1/wall_in.png' });
  const brick = brickTexture(T.wall.tex.image);
  const g = new THREE.Group();
  const H = WALL.height;
  const panel = (i) => {
    const w = WALL.widths[i];
    const geo = new THREE.PlaneGeometry(w, H);
    const [u0, u1] = [WALL.u[i], WALL.u[i + 1]];
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, u0 + (u1 - u0) * uv.getX(k));
    // left wall: its fold line is its right edge; right wall: its left edge
    geo.translate(i === 0 ? -w / 2 : i === 2 ? w / 2 : 0, H / 2, 0);
    const inside = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: T.wall.tex, transparent: true, alphaTest: 0.5, side: THREE.FrontSide }));
    const outside = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: brick, transparent: true, alphaTest: 0.5, side: THREE.BackSide }));
    const p = new THREE.Group();
    for (const m of [inside, outside]) { m.rotation.x = Math.PI / 2; p.add(m); }
    return p;
  };
  const centre = panel(1);
  centre.position.set(0, WALL.y, 0);
  const left = panel(0);
  left.position.set(-HALF, WALL.y, 0);
  left.rotation.z = OPEN;
  const right = panel(2);
  right.position.set(HALF, WALL.y, 0);
  right.rotation.z = -OPEN;
  g.add(centre, left, right);
  return g;
}

// brick for the outside of the walls, cut to the same outline as the printed inside
function brickTexture(wallImage) {
  const c = document.createElement('canvas');
  c.width = wallImage.width; c.height = wallImage.height;
  const x = c.getContext('2d');
  x.fillStyle = '#cbb9a8'; x.fillRect(0, 0, c.width, c.height);
  const bw = c.width / 26, bh = bw / 2.4;
  for (let r = 0; r * bh < c.height; r++) {
    for (let k = -1; k * bw < c.width + bw; k++) {
      const off = (r % 2) * bw / 2;
      x.fillStyle = `hsl(${18 + ((k * 7 + r * 3) % 9)}, 17%, ${63 + ((k * 13 + r * 7) % 8)}%)`;
      x.fillRect(k * bw + off + 2, r * bh + 2, bw - 4, bh - 4);
    }
  }
  x.globalCompositeOperation = 'destination-in';   // keep only the wall's outline
  x.drawImage(wallImage, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}
