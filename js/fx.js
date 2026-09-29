// Visual effects for the AR scenes: particle weather, sparkles, light rings,
// light pillars, paper-plane flights with dotted trails and soft contact shadows.
// Everything is a pure function of time where possible, so scenes loop cleanly.
import * as THREE from 'three';
import { clamp01, lerp, mulberry32, smooth01 } from './engine.js';

/* ---------------- procedural textures ---------------- */
const texCache = {};
function canvasTex(key, size, draw) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  texCache[key] = t;
  return t;
}
export const TEX = {
  dot: () => canvasTex('dot', 64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.75)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  }),
  star: () => canvasTex('star', 64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.18, 'rgba(255,250,230,0.6)');
    r.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter';
    const ray = (w, h) => {
      const lg = g.createLinearGradient(s / 2 - w / 2, 0, s / 2 + w / 2, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.95)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.fillRect(s / 2 - w / 2, s / 2 - h / 2, w, h);
    };
    ray(s, 3);
    g.translate(s / 2, s / 2); g.rotate(Math.PI / 2); g.translate(-s / 2, -s / 2);
    ray(s, 3);
  }),
  shadow: () => canvasTex('shadow', 128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(40,28,16,0.85)');
    r.addColorStop(0.5, 'rgba(40,28,16,0.4)');
    r.addColorStop(1, 'rgba(40,28,16,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  }),
  ring: () => canvasTex('ring', 128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, s * 0.28, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,0)');
    r.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  }),
  streak: () => canvasTex('streak', 64, (g, s) => {
    const lg = g.createLinearGradient(0, 0, 0, s);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.fillRect(s / 2 - 1.5, 0, 3, s);
  }),
  pillar: () => canvasTex('pillar', 64, (g, s) => {
    const lg = g.createLinearGradient(0, s, 0, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0.9)');
    lg.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.fillRect(0, 0, s, s);
  }),
};

/* ---------------- particle field (one draw call) ---------------- */
const P_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aRot;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying float vRot;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // sizes are in scene units: follow the object's scale (the AR anchor scales everything)
    gl_PointSize = clamp(aSize * length(modelViewMatrix[0].xyz) * uScale / max(-mv.z, 0.0001), 0.0, 180.0);
    vAlpha = aAlpha; vRot = aRot; vColor = aColor;
  }
`;
const P_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vRot;
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
    vec4 t = texture2D(map, vec2(p.x, 1.0 - p.y));
    gl_FragColor = vec4(t.rgb * vColor, t.a * vAlpha * uOpacity);
    if (gl_FragColor.a < 0.004) discard;
    #include <encodings_fragment>
  }
`;

export class Particles {
  // mode: fall | across | float | rise | burst
  constructor(parent, opts = {}) {
    const o = (this.o = {
      count: 30, map: null, size: [0.012, 0.022], color: 0xffffff, colors: null,
      additive: false, opacity: 1, mode: 'fall',
      box: { x: [-0.2, 0.2], y: [-0.2, 0.2], z: [0, 0.3] },
      speed: [0.03, 0.06], sway: 0.015, swayFreq: 0.8, spin: 1.2,
      wind: [0, 0], twinkle: 0, seed: 1, renderOrder: 30,
      gravity: -0.35, burstSpeed: [0.12, 0.3], life: [0.8, 1.6], center: [0, 0, 0.05],
      ...opts,
    });
    const n = o.count;
    const rnd = mulberry32(o.seed);
    this.items = [];
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const alpha = new Float32Array(n);
    const rot = new Float32Array(n);
    const col = new Float32Array(n * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      tmp.set(o.colors ? o.colors[Math.floor(rnd() * o.colors.length)] : o.color);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
      size[i] = lerp(o.size[0], o.size[1], rnd());
      const dir = rnd() * Math.PI * 2, up = rnd();
      this.items.push({
        x: lerp(o.box.x[0], o.box.x[1], rnd()),
        y: lerp(o.box.y[0], o.box.y[1], rnd()),
        z: lerp(o.box.z[0], o.box.z[1], rnd()),
        ph: rnd() * 100,
        sp: lerp(o.speed[0], o.speed[1], rnd()),
        sw: o.sway * (0.5 + rnd()),
        wf: o.swayFreq * (0.7 + 0.6 * rnd()),
        rs: o.spin * (rnd() - 0.5) * 2,
        // burst
        vx: Math.cos(dir) * (0.3 + 0.7 * up), vy: Math.sin(dir) * (0.3 + 0.7 * up), vz: 0.5 + up,
        bs: lerp(o.burstSpeed[0], o.burstSpeed[1], rnd()),
        life: lerp(o.life[0], o.life[1], rnd()),
        delay: rnd() * 0.25,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute('aRot', new THREE.BufferAttribute(rot, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: o.map || TEX.dot() }, uScale: { value: 500 }, uOpacity: { value: o.opacity } },
      vertexShader: P_VERT,
      fragmentShader: P_FRAG,
      transparent: true,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.renderOrder = o.renderOrder;
    this.points.frustumCulled = false;
    this.points.onBeforeRender = (renderer, scene, camera) => {
      const h = renderer.getDrawingBufferSize(_v2).y;
      this.mat.uniforms.uScale.value = h * 0.5 * camera.projectionMatrix.elements[5];
    };
    this.master = 1;
    this.burstAt = -1e9;
    parent.add(this.points);
  }

  set(v) { this.master = clamp01(v); this.points.visible = this.master > 0.001; }
  trigger(t, center) {
    this.burstAt = t;
    if (center) this.o.center = center;
  }

  update(t) {
    if (!this.points.visible) return;
    const o = this.o;
    const g = this.points.geometry;
    const pos = g.attributes.position.array;
    const al = g.attributes.aAlpha.array;
    const rot = g.attributes.aRot.array;
    const { x: bx, y: by, z: bz } = o.box;
    const zs = bz[1] - bz[0], xs = bx[1] - bx[0];
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      let x, y, z, a = 1;
      if (o.mode === 'fall') {
        const k = ((it.z - bz[0]) / zs + (t * it.sp) / zs + it.ph) % 1;
        z = bz[1] - k * zs;
        x = it.x + it.sw * Math.sin(t * it.wf + it.ph) + o.wind[0] * k;
        y = it.y + o.wind[1] * k;
        a = Math.min(1, k * 8) * Math.min(1, (1 - k) * 5);
      } else if (o.mode === 'rise') {
        const k = ((t * it.sp) / zs + it.ph) % 1;
        z = bz[0] + k * zs;
        x = it.x + it.sw * Math.sin(t * it.wf + it.ph);
        y = it.y + it.sw * Math.cos(t * it.wf * 0.8 + it.ph);
        a = Math.min(1, k * 5) * Math.min(1, (1 - k) * 3);
      } else if (o.mode === 'across') {
        const k = ((it.x - bx[0]) / xs + (t * it.sp) / xs + it.ph) % 1;
        x = bx[0] + k * xs;
        y = it.y + it.sw * Math.sin(t * it.wf * 0.6 + it.ph);
        z = it.z + it.sw * 1.5 * Math.sin(t * it.wf + it.ph * 2);
        a = Math.min(1, k * 6) * Math.min(1, (1 - k) * 6);
      } else if (o.mode === 'float') {
        x = it.x + it.sw * Math.sin(t * it.wf + it.ph);
        y = it.y + it.sw * Math.cos(t * it.wf * 0.7 + it.ph);
        z = it.z + it.sw * 0.8 * Math.sin(t * it.wf * 1.3 + it.ph * 2);
      } else {
        // burst: one-shot explosion of light from a point
        const [cx, cy, cz] = o.center;
        const tt = t - this.burstAt - it.delay;
        const k = tt / it.life;
        if (tt < 0 || k > 1) { al[i] = 0; continue; }
        const d = it.bs * (1 - Math.pow(1 - Math.min(1, k * 1.2), 3)) * 0.8;
        x = cx + it.vx * d;
        y = cy + it.vy * d;
        z = cz + it.vz * d * 0.8 + o.gravity * 0.05 * tt * tt;
        a = Math.min(1, k * 10) * (1 - k);
      }
      if (o.twinkle) a *= 1 - o.twinkle + o.twinkle * (0.5 + 0.5 * Math.sin(t * 5 * it.wf + it.ph * 7));
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      al[i] = a * this.master;
      rot[i] = o.spin ? it.rs * t + it.ph : (o.rot0 || 0);
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aRot.needsUpdate = true;
  }
}
const _v2 = new THREE.Vector2();

/* ---------------- flat helpers on the page ---------------- */
export function flatSprite(tex, w, h = w, opts = {}) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
      opacity: opts.opacity ?? 1, color: opts.color ?? 0xffffff,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    })
  );
  m.position.z = opts.z ?? 0.002;
  m.renderOrder = opts.renderOrder ?? 1;
  return m;
}

// Soft contact shadow under a character (keeps them "standing" on the paper)
export function contactShadow(w, h = w * 0.35, opacity = 0.45) {
  return flatSprite(TEX.shadow(), w, h, { opacity, renderOrder: 1, z: 0.0015 });
}

// Expanding light ring on the page
export class GroundRing {
  constructor(parent, { size = 0.2, color = 0xffe7b0, dur = 1.6, renderOrder = 2, strength = 0.6 } = {}) {
    this.mesh = flatSprite(TEX.ring(), 1, 1, { color, additive: true, renderOrder });
    this.strength = strength;
    this.mesh.visible = false;
    this.size = size; this.dur = dur; this.at = -1e9;
    parent.add(this.mesh);
  }
  trigger(t, x, y) { this.at = t; this.mesh.position.x = x; this.mesh.position.y = y; }
  update(t) {
    const k = (t - this.at) / this.dur;
    this.mesh.visible = k >= 0 && k <= 1;
    if (!this.mesh.visible) return;
    const s = this.size * (0.2 + 0.8 * (1 - Math.pow(1 - k, 3)));
    this.mesh.scale.set(s, s, 1);
    this.mesh.material.opacity = (1 - k) * Math.min(1, k * 6) * this.strength;
  }
}

// Soft vertical beam of light (the "costume change" moment): bright at the base,
// fading upwards and towards its silhouette edges so it reads as light, not as a tube
const PILLAR_VERT = /* glsl */ `
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;
const PILLAR_FRAG = /* glsl */ `
  uniform vec3 color;
  uniform float opacity;
  uniform float time;
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    float h = pow(1.0 - vUv.y, 1.6);
    float streaks = 0.75 + 0.25 * sin(vUv.x * 62.83 + time * 2.0) * sin(vUv.x * 25.13 - time * 1.3);
    float a = h * pow(vFacing, 2.2) * streaks * opacity;
    gl_FragColor = vec4(color, a);
    if (a < 0.003) discard;
  }
`;
export class LightPillar {
  constructor(parent, { radius = 0.07, height = 0.3, color = 0xfff1c8, renderOrder = 40 } = {}) {
    const geo = new THREE.CylinderGeometry(radius, radius * 1.2, height, 40, 1, true);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, height / 2);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 0 }, time: { value: 0 } },
      vertexShader: PILLAR_VERT, fragmentShader: PILLAR_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }
  set(v, t = 0) {
    this.mesh.visible = v > 0.01;
    this.mat.uniforms.opacity.value = v * 0.42;
    this.mat.uniforms.time.value = t;
    this.mesh.scale.set(0.85 + 0.15 * v, 0.85 + 0.15 * v, 0.35 + 0.65 * smooth01(v));
  }
}

/* ---------------- paper plane with a dotted trail ---------------- */
export class PaperPlane {
  constructor(parent, tex, { size = 0.06, trail = 26, trailColor = 0xfff8ec, renderOrder = 35 } = {}) {
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    this.sprite.scale.set(size, size * (tex.image ? tex.image.height / tex.image.width : 0.8), 1);
    this.sprite.renderOrder = renderOrder;
    this.base = this.sprite.scale.clone();
    parent.add(this.sprite);
    this.trail = new Particles(parent, {
      count: trail, map: TEX.dot(), size: [0.007, 0.007], color: trailColor, mode: 'float',
      sway: 0, renderOrder: renderOrder - 1,
    });
    this.hist = [];
    this.parent = parent;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }
  // path: function k -> [x,y,z];  k in 0..1; vis 0..1
  update(t, k, path, vis, camera) {
    const p = path(clamp01(k));
    const q = path(clamp01(k + 0.01));
    this.sprite.position.set(p[0], p[1], p[2] + 0.006 * Math.sin(t * 7));
    this.sprite.material.opacity = vis;
    this.sprite.visible = vis > 0.01;
    // point the nose along the on-screen direction of travel
    if (camera) {
      this._a.set(p[0], p[1], p[2]); this._b.set(q[0], q[1], q[2]);
      this.parent.localToWorld(this._a).project(camera);
      this.parent.localToWorld(this._b).project(camera);
      // NDC -> screen proportions, then mirror the picture when flying leftwards
      const dx = (this._b.x - this._a.x) * (camera.aspect || 1), dy = this._b.y - this._a.y;
      const flip = dx < 0 ? -1 : 1;
      this.sprite.scale.x = this.base.x * flip;
      this.sprite.material.rotation = flip * Math.atan2(dy, Math.abs(dx) + 1e-6) + 0.1 * Math.sin(t * 3);
    }
    // dotted trail: evenly spaced samples behind the plane
    const it = this.trail.items;
    const n = it.length;
    const g = this.trail.points.geometry;
    const pos = g.attributes.position.array, al = g.attributes.aAlpha.array;
    for (let i = 0; i < n; i++) {
      const kk = k - (i + 1) * 0.012;
      if (kk < 0 || vis < 0.01) { al[i] = 0; continue; }
      const s = path(kk);
      pos[i * 3] = s[0]; pos[i * 3 + 1] = s[1]; pos[i * 3 + 2] = s[2];
      al[i] = vis * (1 - i / n) * 0.9 * ((i % 2) ? 0.0 : 1.0);
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }
}

// Quadratic/cubic bezier path helper for flights
export function bezier(p0, p1, p2, p3) {
  return (k) => {
    const u = 1 - k;
    if (!p3) return [0, 1, 2].map((i) => u * u * p0[i] + 2 * u * k * p1[i] + k * k * p2[i]);
    return [0, 1, 2].map((i) => u * u * u * p0[i] + 3 * u * u * k * p1[i] + 3 * u * k * k * p2[i] + k * k * k * p3[i]);
  };
}

/* ---------------- billboarding ---------------- */
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
const _inv = new THREE.Matrix4();
// Turn a standing pivot around Z so its picture faces the viewer (smoothly). The heading
// follows the camera's orientation (forward + up), so even when the phone looks straight
// down on the page the characters appear upright on screen; in that case they also lean
// back towards the viewer (hinged at their base, up to 60°) instead of becoming slivers.
export function faceCamera(pivot, camera, { smooth = 0.15, base = null, limit = Math.PI, lean = true } = {}) {
  if (!camera || !pivot.parent) return;
  camera.getWorldDirection(_f);
  _u.setFromMatrixColumn(camera.matrixWorld, 1);
  _inv.copy(pivot.parent.matrixWorld).invert();
  _f.transformDirection(_inv);
  _u.transformDirection(_inv);
  // the screen's "up" (projected on the page) is the most stable cue, even when the
  // tracker's tilt estimate for a small icon is off; forward only helps when looking level
  const hx = -(_u.x + 0.12 * _f.x), hy = -(_u.y + 0.12 * _f.y);
  let target = Math.atan2(hx, -hy);
  if (base !== null) {
    let d = wrap(target - base);
    d = Math.max(-limit, Math.min(limit, d));
    target = base + d;
  }
  pivot.rotation.order = 'ZXY';
  const cur = pivot.rotation.z;
  pivot.rotation.z = cur + wrap(target - cur) * smooth;
  if (lean) {
    const elev = Math.acos(Math.max(-1, Math.min(1, _u.z)));   // how far the view looks down
    const want = -Math.max(0, Math.min(1.05, (elev - 0.38) * 0.9));
    pivot.rotation.x += (want - pivot.rotation.x) * smooth;
  }
}
function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/* ---------------- breeze: a bright streak travelling along a curve ---------------- */
const RIB_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const RIB_FRAG = /* glsl */ `
  uniform float head;
  uniform float len;
  uniform float opacity;
  uniform vec3 color;
  varying vec2 vUv;
  void main() {
    float u = vUv.x;
    float a = smoothstep(head - len, head, u) * (1.0 - smoothstep(head, head + 0.04, u));
    a *= 1.0 - abs(vUv.y * 2.0 - 1.0);
    gl_FragColor = vec4(color, a * opacity);
    if (gl_FragColor.a < 0.004) discard;
  }
`;
export class WindRibbon {
  constructor(parent, path, { width = 0.006, segments = 64, color = 0xffffff, opacity = 0.75, len = 0.35, renderOrder = 34 } = {}) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segments; i++) {
      const k = i / segments;
      const p = path(k);
      const w = width * Math.sin(Math.PI * Math.min(1, k * 1.2 + 0.05));
      pos.push(p[0], p[1], p[2] - w / 2, p[0], p[1], p[2] + w / 2);
      uv.push(k, 0, k, 1);
      if (i < segments) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { head: { value: -1 }, len: { value: len }, opacity: { value: opacity }, color: { value: new THREE.Color(color) } },
      vertexShader: RIB_VERT, fragmentShader: RIB_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = renderOrder;
    this.mesh.frustumCulled = false;
    this.base = opacity;
    parent.add(this.mesh);
  }
  // head: 0..1+len along the path; vis: master opacity
  update(head, vis = 1) {
    this.mat.uniforms.head.value = head;
    this.mat.uniforms.opacity.value = this.base * vis;
    this.mesh.visible = vis > 0.01 && head > -0.05 && head < 1 + this.mat.uniforms.len.value;
  }
}

/* ---------------- a child's drawing on a loose sheet of paper ---------------- */
export function drawingTexture(seed = 1) {
  return canvasTex('drawing' + seed, 128, (g, s) => {
    const rnd = mulberry32(seed * 97);
    g.fillStyle = '#fbf7ee'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(120,100,80,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2);
    const cols = ['#e2725b', '#f2b134', '#5b8fd6', '#6aa84f', '#b07cc6'];
    g.lineCap = 'round'; g.lineWidth = 4;
    // sun
    g.strokeStyle = cols[1];
    g.beginPath(); g.arc(28 + rnd() * 20, 30, 12, 0, Math.PI * 2); g.stroke();
    // house or flower
    g.strokeStyle = cols[Math.floor(rnd() * cols.length)];
    if (rnd() > 0.5) {
      g.strokeRect(58, 58, 44, 40);
      g.beginPath(); g.moveTo(54, 60); g.lineTo(80, 36); g.lineTo(106, 60); g.stroke();
    } else {
      g.beginPath(); g.moveTo(80, 110); g.lineTo(80, 64); g.stroke();
      g.strokeStyle = cols[0];
      for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(80 + 10 * Math.cos(i), 56 + 10 * Math.sin(i), 6, 0, 7); g.stroke(); }
    }
    // two stick figures (Diana and Liam)
    g.strokeStyle = '#4a3b2c'; g.lineWidth = 3;
    for (const x of [30, 46]) {
      g.beginPath(); g.arc(x, 82, 5, 0, 7); g.moveTo(x, 87); g.lineTo(x, 104);
      g.moveTo(x - 7, 94); g.lineTo(x + 7, 94); g.moveTo(x, 104); g.lineTo(x - 5, 116); g.moveTo(x, 104); g.lineTo(x + 5, 116); g.stroke();
    }
  });
}
