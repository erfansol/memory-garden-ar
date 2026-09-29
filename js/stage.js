// Building blocks shared by every AR "experience" (one per printed Scan Here icon)
import * as THREE from 'three';
import { Clock, clamp01, easeOut, smooth01 } from './engine.js';
import { VideoClip, loadManifest } from './video.js';
import { Particles, GroundRing, LightPillar, TEX, faceCamera } from './fx.js';
import { sound } from './sound.js';

export class Experience {
  constructor(id) {
    this.id = id;
    this.group = new THREE.Group();
    this.clips = [];
    this.clock = new Clock();
    this.fired = new Set();
    this.resumeList = [];
    this.loops = [];            // ambient sound loops: [{ key, url, vol }]
    this.billboards = [];       // standing pivots that turn towards the viewer
    this.started = false;
    this.lostAt = 0;
    this.msg = '';
  }

  async clip(name) {
    const meta = (await loadManifest())[name];
    const c = new VideoClip(name, meta);
    this.clips.push(c);
    await c.load();
    return c;
  }

  // fire fn once when the timeline passes `at`
  once(key, t, at, fn) {
    if (t >= at && !this.fired.has(key)) {
      this.fired.add(key);
      fn();
    }
  }

  billboard(pivot, opts = {}) {
    this.billboards.push([pivot, opts]);
    return pivot;
  }

  start() {
    this.started = true;
    this.clock.reset();
    this.fired.clear();
    this.clips.forEach((c) => { c.pause(); c.seek(0); });
    this.onRestart?.();
    this.clock.start();
    this.startSound();
  }

  pause() {
    this.clock.stop();
    this.lostAt = performance.now();
    this.resumeList = this.clips.filter((c) => c.wantPlay);
    this.clips.forEach((c) => c.video.pause());
    this.stopSound();
  }

  resume() {
    // after a long break the memory starts again from the beginning
    if (!this.started || performance.now() - this.lostAt > 15000) return this.start();
    this.clock.start();
    this.resumeList.forEach((c) => c.play(c.video.playbackRate));
    this.startSound();
  }

  startSound() {
    for (const l of this.loops) sound.loop(this.id + ':' + l.key, l.url, l.vol ?? 0.6);
  }
  stopSound() {
    for (const l of this.loops) sound.stop(this.id + ':' + l.key);
  }
  cueSound(url, vol = 0.7) { sound.once(url, vol); }

  frame(camera) {
    const t = this.clock.tick();
    for (const c of this.clips) c.tick();
    for (const [p, o] of this.billboards) faceCamera(p, camera, o);
    this.update(t, camera);
  }

  update() {}

  // the line of text this memory wants to show (the app decides which memory speaks)
  say(text) { this.msg = text; }

  prime() { this.clips.forEach((c) => c.prime()); }

  dispose() { this.clips.forEach((c) => c.dispose()); }
}

// Glow + sparkles + light pillar + spin: the magical "a memory appears" moment
export class AppearFX {
  constructor(parent, { x = 0, y = 0, height = 0.25, radius = 0.07, color = 0xffe3a3, count = 36, pillar = true } = {}) {
    this.x = x; this.y = y;
    this.burst = new Particles(parent, {
      count, map: TEX.star(), size: [0.012, 0.03], mode: 'burst', additive: true,
      center: [x, y, height * 0.35], burstSpeed: [radius * 1.6, radius * 3.2], life: [0.9, 1.8],
      colors: [0xffffff, 0xfff0c0, color], renderOrder: 45,
    });
    this.ring = new GroundRing(parent, { size: radius * 3.2, color, dur: 1.8 });
    this.ring2 = new GroundRing(parent, { size: radius * 2, color: 0xffffff, dur: 1.3 });
    this.pillar = pillar ? new LightPillar(parent, { radius, height: height * 1.4, color }) : null;
    if (this.pillar) this.pillar.mesh.position.set(x, y, 0);
    this.at = -1e9;
  }
  trigger(t) {
    this.at = t;
    this.burst.trigger(t);
    this.ring.trigger(t, this.x, this.y);
    this.ring2.trigger(t + 0.25, this.x, this.y);
  }
  update(t) {
    this.burst.update(t);
    this.ring.update(t);
    this.ring2.update(t);
    if (this.pillar) {
      const k = (t - this.at) / 2.2;
      this.pillar.set(k >= 0 && k <= 1 ? Math.sin(Math.PI * clamp01(k)) : 0, t);
    }
  }
  // extra rotation for a "Sims-style" spin: several fast turns that slow to a stop
  spin(t, dur = 1.6, turns = 3) {
    const k = clamp01((t - this.at) / dur);
    return (1 - easeOut(k)) * turns * Math.PI * 2 * (k > 0 ? 1 : 0);
  }
  reveal(t, delay = 0.1, dur = 1.4) {
    return smooth01((t - this.at - delay) / dur);
  }
}
