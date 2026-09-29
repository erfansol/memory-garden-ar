// Transparent video for AR: colour + alpha are packed side by side (or stacked) in one
// ordinary H.264 file, so it plays everywhere (iPhone Safari included). The shader below
// recombines them and adds the magic: dissolve-in, soft shadows, vignettes, wind sway.
import * as THREE from 'three';

let manifest = null;
export async function loadManifest() {
  if (!manifest) manifest = fetch('assets/video/clips.json').then((r) => r.json());
  return manifest;
}

// Every clip that wants to play; if the browser blocks autoplay (e.g. iPhone Low Power
// Mode) one tap anywhere starts them all.
const allClips = new Set();
export const playback = { blocked: false, onBlocked: null };
function retryAll() {
  playback.blocked = false;
  for (const c of allClips) if (c.wantPlay && c.video.paused) c.video.play().catch(() => {});
}
addEventListener('pointerdown', retryAll, { passive: true });

let shelf = null;
function videoShelf() {
  // iOS only decodes reliably when the element is part of the document
  if (!shelf) {
    shelf = document.createElement('div');
    shelf.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1';
    document.body.appendChild(shelf);
  }
  return shelf;
}

export class VideoClip {
  constructor(name, meta) {
    this.name = name;
    this.meta = meta;
    const v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute('muted', '');
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.crossOrigin = 'anonymous';
    v.preload = 'auto';
    // a whole-clip loop can use the browser's own seamless looping
    this.nativeLoop = !!meta.loop && meta.loop[0] === 0;
    v.loop = this.nativeLoop;
    v.src = meta.file;
    videoShelf().appendChild(v);
    this.video = v;
    this.texture = new THREE.VideoTexture(v);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.wantPlay = false;
    // a one-shot clip that has finished holds its last frame (and must not restart on resume)
    v.addEventListener('ended', () => { if (!meta.loop) this.wantPlay = false; });
    allClips.add(this);
  }

  load() {
    const v = this.video;
    if (v.readyState >= 2) return Promise.resolve(this);
    return new Promise((resolve, reject) => {
      const ok = () => { cleanup(); resolve(this); };
      const bad = () => { cleanup(); reject(new Error('Could not load video ' + this.name)); };
      const cleanup = () => {
        v.removeEventListener('loadeddata', ok);
        v.removeEventListener('error', bad);
      };
      v.addEventListener('loadeddata', ok);
      v.addEventListener('error', bad);
      v.load();
    });
  }

  // Called from a user gesture so iOS lets us start playback later
  prime() {
    const v = this.video;
    const p = v.play();
    if (p && p.then) p.then(() => { if (!this.wantPlay) v.pause(); }).catch(() => {});
  }

  play(rate = 1) {
    this.wantPlay = true;
    this.video.playbackRate = rate;
    const p = this.video.play();
    if (p && p.catch) {
      p.catch((e) => {
        if (e && e.name === 'NotAllowedError' && this.wantPlay) {
          playback.blocked = true;
          playback.onBlocked?.();
        }
      });
    }
  }

  pause() {
    this.wantPlay = false;
    this.video.pause();
  }

  seek(t) {
    try { this.video.currentTime = t; } catch (e) { /* not seekable yet */ }
  }

  restart(rate = 1) {
    this.seek(0);
    this.play(rate);
  }

  get time() { return this.video.currentTime; }
  get duration() { return this.meta.duration; }
  get ended() { return this.video.ended || this.video.currentTime >= this.meta.duration - 0.05; }

  // keeps the "intro + held loop" clips cycling inside their loop segment
  tick() {
    const m = this.meta;
    if (this.nativeLoop || !m.loop || !this.wantPlay) return;
    const v = this.video;
    if (v.currentTime >= m.loop[1] - 0.5 / m.fps || v.ended) {
      this.seek(m.loop[0]);
      if (v.paused) this.play(v.playbackRate);
    }
  }

  dispose() {
    allClips.delete(this);
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.video.remove();
    this.texture.dispose();
  }
}

/* ------------------------------------------------------------------ */
const VERT = /* glsl */ `
  uniform float uBend;      // horizontal sway, strongest at the top
  uniform float uSkew;      // shear (for shadows)
  uniform float uHeight;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float k = uv.y;
    p.x += uBend * k * k * uHeight + uSkew * k * uHeight;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform vec4 rectC;
  uniform vec4 rectA;
  uniform float hasAlpha;
  uniform float opacity;
  uniform vec3 tint;
  uniform float tintAmt;
  uniform float reveal;
  uniform vec3 revealColor;
  uniform float seed;
  uniform float aspect;
  uniform float clipLow;
  uniform float vignette;
  uniform float blurA;
  uniform vec2 texel;
  uniform float bright;
  uniform float warm;
  varying vec2 vUv;

  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  float alphaAt(vec2 uv) { return texture2D(map, rectA.xy + uv * rectA.zw).r; }

  void main() {
    vec2 uv = clamp(vUv, 0.0, 1.0);
    vec3 col = texture2D(map, rectC.xy + uv * rectC.zw).rgb * bright;
    col = mix(col, col * vec3(1.05, 1.0, 0.92), warm);
    float a = 1.0;
    if (hasAlpha > 0.5) {
      if (blurA > 0.0) {
        vec2 d = texel * blurA;
        a = alphaAt(uv) * 0.2
          + (alphaAt(uv + vec2(d.x, 0.0)) + alphaAt(uv - vec2(d.x, 0.0))
           + alphaAt(uv + vec2(0.0, d.y)) + alphaAt(uv - vec2(0.0, d.y))) * 0.125
          + (alphaAt(uv + d) + alphaAt(uv - d)
           + alphaAt(uv + vec2(d.x, -d.y)) + alphaAt(uv + vec2(-d.x, d.y))) * 0.075;
      } else {
        a = alphaAt(uv);
      }
      a = smoothstep(0.04, 0.96, a);
    }
    if (vignette > 0.0) {
      // organic, torn-paper edge that melts into the page
      vec2 q = abs(uv - 0.5) * 2.0;
      float d = pow(pow(q.x, 3.0) + pow(q.y, 3.0), 1.0 / 3.0);
      float n = fbm(uv * vec2(aspect, 1.0) * 4.0 + seed) - 0.5;
      a *= 1.0 - smoothstep(1.0 - vignette, 1.0, d + n * 0.22);
    }
    if (clipLow > 0.0) a *= smoothstep(clipLow, clipLow + 0.012, uv.y);
    if (reveal < 0.999) {
      // the memory "draws itself" from the paper upwards, with a warm glowing edge
      float field = fbm(uv * vec2(aspect, 1.0) * 5.0 + seed) * 0.62 + (1.0 - uv.y) * 0.38;
      float th = reveal * 1.3 - 0.18;
      float m = smoothstep(th + 0.015, th - 0.035, field);
      float edge = smoothstep(th - 0.12, th, field) * m;
      col = mix(col, revealColor, clamp(edge * 1.4, 0.0, 1.0));
      a *= m;
    }
    col = mix(col, tint, tintAmt);
    gl_FragColor = vec4(col, a * opacity);
    if (gl_FragColor.a < 0.004) discard;
  }
`;

export function videoMaterial(clip, opts = {}) {
  const m = clip.meta;
  const W = m.layout === 'h' ? m.w * 2 + m.gap : m.w;
  const H = m.layout === 'v' ? m.h * 2 + m.gap : m.h;
  // inset half a texel so filtering never samples the neighbouring half
  const ix = 0.5 / W, iy = 0.5 / H;
  const cw = m.w / W, ch = m.h / H;
  let rectC, rectA;
  if (m.layout === 'h') {
    rectC = new THREE.Vector4(ix, iy, cw - 2 * ix, 1 - 2 * iy);
    rectA = new THREE.Vector4((m.w + m.gap) / W + ix, iy, cw - 2 * ix, 1 - 2 * iy);
  } else if (m.layout === 'v') {
    // video rows run top -> bottom; UV y runs bottom -> top: the colour half is on top
    rectC = new THREE.Vector4(ix, 1 - ch + iy, 1 - 2 * ix, ch - 2 * iy);
    rectA = new THREE.Vector4(ix, iy, 1 - 2 * ix, ch - 2 * iy);
  } else {
    rectC = new THREE.Vector4(0, 0, 1, 1);
    rectA = new THREE.Vector4(0, 0, 1, 1);
  }
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: clip.texture },
      rectC: { value: rectC },
      rectA: { value: rectA },
      hasAlpha: { value: m.layout === 'none' ? 0 : 1 },
      opacity: { value: opts.opacity ?? 1 },
      tint: { value: new THREE.Color(opts.tint ?? 0x000000) },
      tintAmt: { value: opts.tintAmt ?? 0 },
      reveal: { value: opts.reveal ?? 1 },
      revealColor: { value: new THREE.Color(opts.revealColor ?? 0xffe2a8) },
      seed: { value: opts.seed ?? Math.random() * 10 },
      aspect: { value: m.aspect },
      clipLow: { value: 0 },
      vignette: { value: opts.vignette ?? 0 },
      blurA: { value: opts.blur ?? 0 },
      texel: { value: new THREE.Vector2(1 / m.w, 1 / m.h) },
      bright: { value: opts.bright ?? 1 },
      warm: { value: opts.warm ?? 0 },
      uBend: { value: 0 },
      uSkew: { value: 0 },
      uHeight: { value: 1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// A video "paper cut-out": standing (pop-up) or lying flat on the page.
// Returns a pivot group (rotate it around Z to turn it) holding the plane.
export function videoPlane(clip, height, opts = {}) {
  const { standing = true, anchor = 'bottom', renderOrder = 0 } = opts;
  const width = height * clip.meta.aspect;
  const geo = new THREE.PlaneGeometry(width, height, 1, standing ? 8 : 1);
  if (anchor === 'bottom') geo.translate(0, height / 2, 0);
  const mat = videoMaterial(clip, opts);
  mat.uniforms.uHeight.value = height;
  const mesh = new THREE.Mesh(geo, mat);
  if (standing) mesh.rotation.x = Math.PI / 2;
  mesh.renderOrder = renderOrder;
  // pivot (turns towards the viewer) > spin (extra effects rotation) > mesh
  const spin = new THREE.Group();
  spin.add(mesh);
  const pivot = new THREE.Group();
  pivot.add(spin);
  pivot.userData = { mesh, mat, width, height, clip, spin };
  return pivot;
}

/* ------------------------------------------------------------------ */
// Sprite-sheet animation (used for the growing plants: any number of plants,
// each at its own moment of growth, without extra video decoders)
const ATLAS_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform float frame;
  uniform vec2 grid;
  uniform float frames;
  uniform float opacity;
  varying vec2 vUv;
  vec4 cell(float f) {
    f = clamp(f, 0.0, frames - 1.0);
    float c = mod(f, grid.x), r = floor(f / grid.x);
    vec2 uv = (vec2(c, grid.y - 1.0 - r) + clamp(vUv, 0.004, 0.996)) / grid;
    return texture2D(map, uv);
  }
  void main() {
    float f0 = floor(frame);
    vec4 a = cell(f0), b = cell(f0 + 1.0);
    vec4 c = mix(a, b, fract(frame));
    gl_FragColor = vec4(c.rgb, c.a * opacity);
    if (gl_FragColor.a < 0.004) discard;
    // the atlas is an sRGB image (decoded to linear when sampled): encode for the screen
    #include <encodings_fragment>
  }
`;

export function atlasPlane(tex, meta, height, opts = {}) {
  const width = height * meta.aspect;
  const geo = new THREE.PlaneGeometry(width, height, 1, 6);
  geo.translate(0, height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      frame: { value: 0 },
      grid: { value: new THREE.Vector2(meta.cols, meta.rows) },
      frames: { value: meta.frames },
      opacity: { value: 1 },
      uBend: { value: 0 },
      uSkew: { value: 0 },
      uHeight: { value: height },
    },
    vertexShader: VERT,
    fragmentShader: ATLAS_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.renderOrder = opts.renderOrder ?? 0;
  const pivot = new THREE.Group();
  pivot.add(mesh);
  pivot.userData = { mesh, mat, width, height };
  return pivot;
}
