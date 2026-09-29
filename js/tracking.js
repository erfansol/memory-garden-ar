// Keeps the AR memory steady on the printed page.
//
// MindAR reports one pose per tracked target, at the tracker's rate (≈15-30 fps), and
// hides a target's anchor as soon as it is lost. Rendering straight from that looks
// jumpy and blinks whenever tracking hiccups. A Stage instead:
//   - follows whichever target of its scene is visible (left or right leaf), and glides
//     from one to the other instead of jumping
//   - smooths the pose on every rendered frame (position and rotation separately, with an
//     adaptive cut-off: steady when the phone is still, responsive when it moves)
//   - holds the last pose for a moment when tracking drops out, and only then fades away
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

// A tracked pose sometimes flips between two solutions from one tracker update to the
// next (the page seen from an angle unlike the target's). Real motion is continuous, a
// flip is a jump: jumps are only followed once they have lasted GATE seconds.
const JUMP = 0.07;   // page widths (position) + radians/2 (rotation) that count as a jump
const GATE = 0.4;

// one-euro style smoothing factor for a frame of dt seconds at cut-off fc (Hz)
const alpha = (fc, dt) => {
  const r = 2 * Math.PI * fc * dt;
  return r / (r + 1);
};

export class Stage {
  constructor(world, { hold = 0.7, fade = 0.35, blend = 0.35 } = {}) {
    this.group = new THREE.Group();        // put the scene's content (in page units) in here
    this.root = new THREE.Group();         // follows the page in camera space
    this.root.matrixAutoUpdate = false;
    this.root.add(this.group);
    this.root.visible = false;
    world.add(this.root);
    this.hold = hold; this.fade = fade; this.blend = blend;
    this.pos = new THREE.Vector3(); this.rot = new THREE.Quaternion(); this.scl = new THREE.Vector3(1, 1, 1);
    this.has = false;          // a pose has been set
    this.current = null;       // the slot currently followed
    this.lastSeen = -1e9;
    this.switchAt = -1e9;
    this.opacity = 0;
  }

  // replaces the raw pose in _p/_q/_s by the last accepted one while a jump is unconfirmed
  gate(now, target) {
    const acc = this.acc;
    const fresh = !acc || acc.slot !== target || now - this.lastShown > 0.3;
    if (!fresh) {
      const scale = Math.max(1e-6, acc.s.x);
      const jump = acc.p.distanceTo(_p) / scale + Math.acos(Math.min(1, Math.abs(acc.q.dot(_q)))) ;
      if (jump > JUMP) {
        const pend = this.pend;
        const same = pend && pend.p.distanceTo(_p) / scale + Math.acos(Math.min(1, Math.abs(pend.q.dot(_q)))) < JUMP;
        if (!same) this.pend = { p: _p.clone(), q: _q.clone(), since: now };
        else if (now - pend.since >= GATE) { this.pend = null; this.store(target); return; }
        _p.copy(acc.p); _q.copy(acc.q); _s.copy(acc.s);   // hold on to the accepted pose
        return;
      }
    }
    this.pend = null;
    this.store(target);
  }

  store(target) {
    if (!this.acc) this.acc = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
    this.acc.p.copy(_p); this.acc.q.copy(_q); this.acc.s.copy(_s); this.acc.slot = target;
  }

  // slots: [{ anchor, G, ref }] of this scene (a target + its MindAR anchor); now in s; dt of this frame
  update(slots, now, dt) {
    const visible = slots.filter((s) => s.anchor.group.visible);
    let target = null;
    if (visible.length) {
      target = visible.includes(this.current) ? this.current : visible[0];
      if (target !== this.current) {
        if (this.current) this.switchAt = now;
        this.current = target;
      }
      this.lastSeen = now;
    }

    if (target) {
      pagePose(target.anchor.group.matrix, target, _m);
      _m.decompose(_p, _q, _s);
      this.gate(now, target);
      if (!this.has || now - this.lastShown > this.hold + this.fade) {
        // first sight (or back after a long break): jump straight there
        this.pos.copy(_p); this.rot.copy(_q); this.scl.copy(_s);
        this.has = true;
      } else {
        // adaptive smoothing: the faster the page moves on screen, the less we smooth
        const scale = Math.max(1e-6, this.scl.x);
        const v = this.pos.distanceTo(_p) / scale / Math.max(dt, 1e-3);        // page widths per second
        const w = 2 * Math.acos(Math.min(1, Math.abs(this.rot.dot(_q)))) / Math.max(dt, 1e-3); // rad/s
        let ap = alpha(2.2 + 7 * v, dt);
        let ar = alpha(1.6 + 2.5 * w, dt);
        // while gliding from one leaf's target to the other, move a little slower
        const k = (now - this.switchAt) / this.blend;
        if (k >= 0 && k < 1) { ap *= 0.35 + 0.65 * k; ar *= 0.35 + 0.65 * k; }
        this.pos.lerp(_p, ap);
        this.rot.slerp(_q, ar);
        this.scl.lerp(_s, ap);
      }
      this.lastShown = now;
    }

    // visibility: fully shown while tracked, held for a moment after, then faded out
    const since = now - this.lastSeen;
    const want = !this.has ? 0 : since <= this.hold ? 1 : Math.max(0, 1 - (since - this.hold) / this.fade);
    this.opacity = want;
    this.root.visible = want > 0.01;
    if (this.root.visible) {
      this.root.matrix.compose(this.pos, this.rot, this.scl);
      this.root.matrixWorldNeedsUpdate = true;
    }
    return { tracked: !!target, shown: this.root.visible, lostFor: since };
  }
}

/* ---------------- the page's pose from a target's pose ----------------
   A target is an image of the page: either the leaf seen from above (then G, the map
   from page units to target units, is a plain scale + shift) or the leaf as a phone sees
   it from low in front of the book (then G is a full perspective homography).
   MindAR tracks the target as a flat picture; composing its pose with G gives the
   homography page → camera, H = [c0 c1 c3]·G, and a standard planar decomposition of H
   gives the page's real position and orientation. */
const _h = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
function norm(v) { return Math.hypot(v[0], v[1], v[2]); }
export function pagePose(m, target, out) {
  const e = m.elements;                        // column-major: c0 = e0..2, c1 = e4..6, c3 = e12..14
  const G = target.G;
  for (let j = 0; j < 3; j++) {
    for (let r = 0; r < 3; r++) _h[j][r] = e[r] * G[0][j] + e[4 + r] * G[1][j] + e[12 + r] * G[2][j];
  }
  // scale: the page passes through the target plane at the leaf's centre
  const [rx, ry] = target.ref;
  const w = G[2][0] * rx + G[2][1] * ry + G[2][2];
  const lam = 1 / w;
  const n0 = norm(_h[0]), n1 = norm(_h[1]);
  const sigma = lam * (n0 + n1) / 2;
  // closest rotation to the two in-plane axes (symmetric orthonormalisation)
  const a = _h[0].map((v) => v / n0), b = _h[1].map((v) => v / n1);
  const c = [a[0] + b[0], a[1] + b[1], a[2] + b[2]], d = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const nc = norm(c), nd = norm(d);
  const r1 = [0, 1, 2].map((i) => (c[i] / nc + d[i] / nd) / Math.SQRT2);
  const r2 = [0, 1, 2].map((i) => (c[i] / nc - d[i] / nd) / Math.SQRT2);
  const r3 = [r1[1] * r2[2] - r1[2] * r2[1], r1[2] * r2[0] - r1[0] * r2[2], r1[0] * r2[1] - r1[1] * r2[0]];
  out.set(
    sigma * r1[0], sigma * r2[0], sigma * r3[0], lam * _h[2][0],
    sigma * r1[1], sigma * r2[1], sigma * r3[1], lam * _h[2][1],
    sigma * r1[2], sigma * r2[2], sigma * r3[2], lam * _h[2][2],
    0, 0, 0, 1,
  );
  return out;
}
