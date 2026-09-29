// Shared helpers for "The Memory Garden" AR scenes
// Axis convention: X = right across the page, Y = towards the top edge of the page, Z = up out of the paper
import * as THREE from 'three';

/* ---------- math helpers ---------- */
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth01 = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
export const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export const easeOut = (k) => 1 - Math.pow(1 - k, 3);
export const easeIn = (k) => k * k * k;
export const easeOutBack = (k) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};

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
const texCache = new Map();
export function loadTexture(path) {
  if (!texCache.has(path)) {
    texCache.set(path, new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(
        path,
        (tex) => {
          tex.encoding = THREE.sRGBEncoding;
          tex.anisotropy = 4;
          resolve({ tex, w: tex.image.width, h: tex.image.height });
        },
        undefined,
        () => reject(new Error('Failed to load ' + path))
      );
    }));
  }
  return texCache.get(path);
}
export async function loadTextures(paths, base = 'assets/') {
  const entries = await Promise.all(
    Object.entries(paths).map(async ([key, p]) => [key, await loadTexture(base + p)])
  );
  return Object.fromEntries(entries);
}

/* ---------- paper cutout (static picture) ---------- */
// standing=true → stands upright on the page like a pop-up piece, facing the -Y viewer
export function cutout(asset, width, opts = {}) {
  const { standing = true, anchor = 'bottom', renderOrder = 0, opacity = 1 } = opts;
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

/* ---------- message captions ---------- */
let capEl = null, capCur = '';
export function caption(text) {
  if (!capEl) capEl = document.getElementById('caption');
  if (!capEl || text === capCur) return;
  capCur = text;
  if (!text) capEl.classList.remove('show');
  else {
    capEl.classList.remove('show');
    // restart the fade so a new line gently replaces the old one
    requestAnimationFrame(() => {
      capEl.textContent = text;
      capEl.classList.add('show');
    });
  }
}

/* ---------- a scene timeline that can pause while tracking is lost ---------- */
export class Clock {
  constructor() { this.t = 0; this.running = false; this.last = null; }
  start() { this.running = true; this.last = performance.now(); }
  stop() { this.running = false; }
  reset() { this.t = 0; }
  tick() {
    const now = performance.now();
    if (this.running && this.last !== null) this.t += Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    return this.t;
  }
}
