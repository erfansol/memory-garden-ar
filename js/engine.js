// 2.5D scene engine for "The Memory Garden"
// Axis convention: X = right across the page, Y = depth (top of the page image), Z = up out of the page
import * as THREE from 'three';

/* ---------- math helpers ---------- */
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export const easeOut = (k) => 1 - Math.pow(1 - k, 3);
export const easeIn = (k) => k * k * k;
export const easeOutBack = (k) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
export const linear = (k) => k;

// Eased 0..1 progress inside the interval [start, start+dur] of a timeline
export function seg(t, start, dur, ease = easeInOut) {
  return ease(clamp01((t - start) / dur));
}
// Soft 0..1..0 window over an interval (for fade in/out)
export function window01(t, start, dur, fade = 0.8) {
  const a = clamp01((t - start) / fade);
  const b = clamp01((start + dur - t) / fade);
  return Math.min(a, b);
}
// Smooth 0..1..0 wave with a given period
export const pulse = (t, period) => 0.5 - 0.5 * Math.cos((t / period) * Math.PI * 2);
// Repeatable pseudo-random generator
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- texture loading ---------- */
export function loadTextures(paths, base = 'assets/') {
  const loader = new THREE.TextureLoader();
  const jobs = Object.entries(paths).map(
    ([key, p]) =>
      new Promise((resolve, reject) => {
        loader.load(
          base + p,
          (tex) => {
            tex.encoding = THREE.sRGBEncoding;
            tex.anisotropy = 4;
            resolve([key, { tex, w: tex.image.width, h: tex.image.height }]);
          },
          undefined,
          () => reject(new Error('Failed to load ' + p))
        );
      })
  );
  return Promise.all(jobs).then(Object.fromEntries);
}

/* ---------- paper cutout (sprite) ---------- */
// standing=true → stands upright on the page like a pop-up piece, facing the viewer
export function cutout(asset, width, opts = {}) {
  const {
    standing = true,
    anchor = 'bottom',   // bottom | center
    renderOrder = 0,
    opacity = 1,
  } = opts;
  const height = width * (asset.h / asset.w);
  const geo = new THREE.PlaneGeometry(width, height);
  if (anchor === 'bottom') geo.translate(0, height / 2, 0);
  const mat = new THREE.MeshBasicMaterial({
    map: asset.tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    opacity,
  });
  const mesh = new THREE.Mesh(geo, mat);
  if (standing) mesh.rotation.x = Math.PI / 2;
  mesh.renderOrder = renderOrder;
  mesh.userData.h = height;
  mesh.userData.w = width;
  return mesh;
}

/* ---------- drifting particle system ---------- */
// mode: 'fall' (falling from above) | 'across' (crossing sideways) | 'float' (hovering in place)
export class Drift {
  constructor(parent, asset, opts = {}) {
    const {
      count = 24, size = 0.022, sizeJitter = 0.5,
      xRange = [-0.5, 0.5], yRange = [-0.3, 0.32], zRange = [0.02, 0.42],
      speed = 0.05, sway = 0.03, swayFreq = 0.6, spin = 1.4,
      opacity = 0.9, mode = 'fall', seed = 7, renderOrder = 25,
    } = opts;
    this.mode = mode; this.opacity = opacity; this.master = 1;
    this.zRange = zRange; this.xRange = xRange;
    this.items = [];
    this.group = new THREE.Group();
    const rnd = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const s = size * (1 + sizeJitter * (rnd() - 0.5) * 2);
      const m = cutout(asset, s, { anchor: 'center', renderOrder, opacity });
      const it = {
        m,
        x0: lerp(xRange[0], xRange[1], rnd()),
        y0: lerp(yRange[0], yRange[1], rnd()),
        z0: lerp(zRange[0], zRange[1], rnd()),
        ph: rnd() * Math.PI * 2,
        sp: speed * (0.7 + 0.6 * rnd()),
        sw: sway * (0.6 + 0.8 * rnd()),
        wf: swayFreq * (0.7 + 0.6 * rnd()),
        rot: spin * (rnd() - 0.5) * 2,
      };
      this.group.add(m);
      this.items.push(it);
    }
    parent.add(this.group);
  }
  set(v) { this.master = clamp01(v); this.group.visible = this.master > 0.01; }
  update(t) {
    if (!this.group.visible) return;
    const zSpan = this.zRange[1] - this.zRange[0];
    const xSpan = this.xRange[1] - this.xRange[0];
    for (const it of this.items) {
      const { m } = it;
      let edge = 1;
      if (this.mode === 'fall') {
        const z = this.zRange[1] - (((it.z0 - this.zRange[0]) + it.sp * t) % zSpan);
        m.position.set(it.x0 + it.sw * Math.sin(t * it.wf + it.ph), it.y0, z);
        const k = (z - this.zRange[0]) / zSpan;
        edge = Math.min(1, k * 6) * Math.min(1, (1 - k) * 6 + 0.35);
      } else if (this.mode === 'across') {
        const x = this.xRange[0] + (((it.x0 - this.xRange[0]) + it.sp * t) % xSpan);
        m.position.set(x, it.y0, it.z0 + it.sw * Math.sin(t * it.wf + it.ph));
        const k = (x - this.xRange[0]) / xSpan;
        edge = Math.min(1, k * 5) * Math.min(1, (1 - k) * 5);
      } else {
        m.position.set(
          it.x0 + it.sw * Math.sin(t * it.wf + it.ph),
          it.y0,
          it.z0 + it.sw * 0.7 * Math.sin(t * it.wf * 0.8 + it.ph * 2)
        );
        edge = 0.75 + 0.25 * Math.sin(t * it.wf + it.ph);
      }
      m.rotation.z = it.rot * Math.sin(t * it.wf * 0.9 + it.ph);
      m.material.opacity = this.opacity * this.master * edge;
    }
  }
}

/* ---------- message captions ---------- */
let capEl = null, capCur = '';
export function caption(text) {
  if (!capEl) capEl = document.getElementById('caption');
  if (!capEl || text === capCur) return;
  capCur = text;
  if (!text) capEl.classList.remove('show');
  else { capEl.textContent = text; capEl.classList.add('show'); }
}

/* ---------- paper-plane flight path ---------- */
// Moves along a quadratic bezier curve with a flutter wobble; k = progress 0..1
export function flyOn(mesh, k, p0, p1, p2, flutterT = 0) {
  const a = lerp(p0[0], p1[0], k), b = lerp(p1[0], p2[0], k);
  const c = lerp(p0[1], p1[1], k), d = lerp(p1[1], p2[1], k);
  const e = lerp(p0[2], p1[2], k), f = lerp(p1[2], p2[2], k);
  mesh.position.set(lerp(a, b, k), lerp(c, d, k), lerp(e, f, k) + 0.008 * Math.sin(flutterT * 9));
  mesh.rotation.z = 0.5 * (lerp(b, a, k) - mesh.position.x) * 20 + 0.15 * Math.sin(flutterT * 7);
}
