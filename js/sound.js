// Optional soundtrack (off by default). Uses Web Audio so that, once the viewer taps
// the sound button, loops and cues can start at any moment (iOS blocks <audio> otherwise).
class Sound {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.master = null;
    this.buffers = new Map();
    this.loops = new Map();
    this.wanted = new Map();   // loops requested while sound was off
  }

  async enable() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    await this.ctx.resume();
    this.enabled = true;
    for (const [key, [url, vol]] of this.wanted) this.loop(key, url, vol);
    return true;
  }

  disable() {
    this.enabled = false;
    for (const key of [...this.loops.keys()]) this._stop(key, 0.4);
  }

  buffer(url) {
    if (!this.buffers.has(url)) {
      this.buffers.set(url, fetch(url)
        .then((r) => r.arrayBuffer())
        .then((b) => new Promise((res, rej) => this.ctx.decodeAudioData(b, res, rej))));
    }
    return this.buffers.get(url);
  }

  async loop(key, url, vol = 0.6) {
    this.wanted.set(key, [url, vol]);
    if (!this.enabled || this.loops.has(key)) return;
    this.loops.set(key, null);
    try {
      const buf = await this.buffer(url);
      if (!this.enabled || !this.wanted.has(key)) { this.loops.delete(key); return; }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 1.2);
      src.connect(g).connect(this.master);
      src.start();
      this.loops.set(key, { src, g });
    } catch (e) {
      this.loops.delete(key);
    }
  }

  stop(key) {
    this.wanted.delete(key);
    this._stop(key, 0.8);
  }

  _stop(key, fade) {
    const l = this.loops.get(key);
    this.loops.delete(key);
    if (!l) return;
    const now = this.ctx.currentTime;
    l.g.gain.cancelScheduledValues(now);
    l.g.gain.setValueAtTime(l.g.gain.value, now);
    l.g.gain.linearRampToValueAtTime(0, now + fade);
    l.src.stop(now + fade + 0.05);
  }

  async once(url, vol = 0.7) {
    if (!this.enabled) return;
    try {
      const buf = await this.buffer(url);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(g).connect(this.master);
      src.start();
    } catch (e) { /* ignore */ }
  }
}

export const sound = new Sound();
