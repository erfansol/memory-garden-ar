// The Memory Garden player — Preview (3D, no camera) and AR (camera + printed book)
import * as THREE from 'three';
import { OrbitControls } from '../libs/OrbitControls.js';
import { loadTexture, caption } from './engine.js';
import { TARGETS, PAGE_H, pageToTarget } from './layout.js';
import { GroundRing } from './fx.js';
import { sound } from './sound.js';
import { playback } from './video.js';
import * as S1 from './scenes/scene1.js';
import * as S7 from './scenes/scene7.js';
import * as S8 from './scenes/scene8.js';
import * as S9 from './scenes/scene9.js';

const SCENES = {
  1: { title: 'Scene 1 — Memories', mod: S1 },
  7: { title: 'Scene 7 — The Doll', mod: S7 },
  8: { title: 'Scene 8 — Planting Seeds', mod: S8 },
  9: { title: 'Scene 9 — The Memory Garden', mod: S9 },
};
const BUILDERS = { ...S1.STATIONS, ...S7.STATIONS, ...S8.STATIONS, ...S9.STATIONS };

const params = new URLSearchParams(location.search);
const sceneId = params.get('scene');
const mode = params.get('mode') || 'preview';
const scene = SCENES[sceneId];
if (params.has('clean')) document.body.classList.add('clean');   // no HUD/captions (screenshots)

const $ = (id) => document.getElementById(id);
const overlay = $('start-overlay');
const startBtn = $('start-btn');
const errEl = $('err');
const titleEl = $('scene-title');
const loadingEl = $('loading');
const hintEl = $('scan-hint');

function fail(msg) {
  overlay.classList.remove('hidden');
  startBtn.style.display = 'none';
  errEl.textContent = msg;
}
function setTitle(text) { titleEl.textContent = text; }
function loading(on, text = 'Opening the memory…') {
  loadingEl.textContent = text;
  loadingEl.classList.toggle('show', on);
}

/* ---------------- sound toggle ---------------- */
const soundBtn = $('sound-btn');
let activeForSound = () => [];
soundBtn.addEventListener('click', async () => {
  if (!sound.enabled) {
    const ok = await sound.enable();
    if (ok) activeForSound().forEach((x) => x.startSound());
  } else {
    sound.disable();
  }
  soundBtn.classList.toggle('on', sound.enabled);
  soundBtn.setAttribute('aria-pressed', String(sound.enabled));
  soundBtn.title = sound.enabled ? 'Sound on' : 'Sound off';
});

// Which memory gets to speak: the first one that has something to say.
// Narration goes to the caption at the bottom; a character's words float above her head.
const bubbleEl = $('bubble');
const _p = new THREE.Vector3();
let bubbleText = '';
function speak(list, camera) {
  if (playback.blocked) caption('Tap the screen to start the animation');
  else {
    const x = list.find((e) => e && e.msg);
    caption(x ? x.msg : '');
  }
  const b = list.find((e) => e && e.bubble);
  let shown = false;
  if (b) {
    _p.set(...b.bubble.local);
    b.bubble.obj.localToWorld(_p);
    _p.project(camera);
    if (_p.z < 1 && Math.abs(_p.x) < 1.2 && Math.abs(_p.y) < 1.2) {
      if (bubbleText !== b.bubble.text) { bubbleText = b.bubble.text; bubbleEl.textContent = bubbleText; }
      const w = bubbleEl.offsetWidth, h = bubbleEl.offsetHeight;
      const px = Math.min(innerWidth - w / 2 - 8, Math.max(w / 2 + 8, (_p.x * 0.5 + 0.5) * innerWidth));
      const py = Math.max(h + 70, (-_p.y * 0.5 + 0.5) * innerHeight);
      bubbleEl.style.transform = `translate(${px - w / 2}px, ${py - h - 14}px)`;
      shown = true;
    }
  }
  bubbleEl.classList.toggle('show', shown);
}

/* ================= Preview: the open book on a table ================= */
async function startPreview() {
  overlay.classList.add('hidden');
  setTitle(scene.title);
  loading(true, 'Loading the page…');
  const container = $('app');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  const world = new THREE.Scene();
  world.background = new THREE.Color(0xe7dfd1);
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 50);
  camera.up.set(0, 0, 1);
  camera.position.set(0.12, -0.98, 0.62);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.03, 0.08);
  // optional viewpoint, e.g. app.html?scene=1&mode=preview&cam=0,1,0.6&look=0,0.2,0.1
  const vec = (k) => params.get(k) && params.get(k).split(',').map(Number);
  if (vec('cam')) camera.position.set(...vec('cam'));
  if (vec('look')) controls.target.set(...vec('look'));
  controls.enableDamping = true;
  controls.minDistance = 0.3;
  controls.maxDistance = 2.4;
  controls.maxPolarAngle = 1.48;

  // table, soft shadow under the book, and the printed page
  const table = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color: 0xd9cfbd }));
  table.position.z = -0.004;
  world.add(table);
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(1.08, PAGE_H + 0.08), new THREE.MeshBasicMaterial({ color: 0x9c8f7a, transparent: true, opacity: 0.35 }));
  shade.position.set(0.006, -0.008, -0.003);
  world.add(shade);
  const pageTex = (await loadTexture(`assets/scene${sceneId}/ground.jpg`)).tex;
  const page = new THREE.Mesh(new THREE.PlaneGeometry(1, PAGE_H), new THREE.MeshBasicMaterial({ map: pageTex }));
  world.add(page);
  world.add(await scene.mod.popup());

  const ids = Object.keys(scene.mod.STATIONS);
  loading(true, 'Loading the memories…');
  const exps = await Promise.all(ids.map((id) => BUILDERS[id]()));
  loading(false);
  exps.forEach((x) => world.add(x.group));
  exps.forEach((x, i) => setTimeout(() => x.start(), 300 + i * 1400));
  activeForSound = () => exps.filter((x) => x.started);

  $('replay-btn').hidden = false;
  $('replay-btn').onclick = () => exps.forEach((x, i) => setTimeout(() => x.start(), i * 900));

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  document.addEventListener('visibilitychange', () => {
    exps.forEach((x) => (document.hidden ? x.pause() : x.resume()));
  });

  renderer.setAnimationLoop(() => {
    controls.update();
    for (const x of exps) x.frame(camera);
    speak(exps, camera);
    renderer.render(world, camera);
  });
}

/* ================= AR: the printed book through the camera ================= */
async function startAR() {
  const { MindARThree } = await import('mindar-image-three');
  const mindar = new MindARThree({
    container: $('app'),
    imageTargetSrc: './targets/targets.mind',
    maxTrack: 1,
    uiLoading: 'no',
    uiScanning: 'no',
    uiError: 'no',
    filterMinCF: 0.0001,
    filterBeta: 0.001,
    warmupTolerance: 3,
    missTolerance: 10,
  });
  const { renderer, scene: world, camera } = mindar;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  // one anchor per printed icon; its memory is built the first time it is seen
  const slots = TARGETS.map((target, i) => {
    const anchor = mindar.addAnchor(i);
    const wrap = new THREE.Group();
    const m = pageToTarget(target);
    wrap.scale.setScalar(m.scale);
    wrap.position.set(m.x, m.y, 0);
    anchor.group.add(wrap);
    // a soft pulsing ring on the icon while its memory loads
    const holder = new THREE.Group();
    anchor.group.add(holder);
    const ring = new GroundRing(holder, { size: 1.3, color: 0xfff0c8, dur: 1.4 });
    const slot = { target, anchor, wrap, ring, exp: null, building: null, active: false };
    anchor.onTargetFound = () => activate(slot);
    anchor.onTargetLost = () => deactivate(slot);
    return slot;
  });

  const build = (slot) => {
    if (!slot.building) {
      slot.building = BUILDERS[slot.target.id]().then((x) => {
        slot.exp = x;
        slot.wrap.add(x.group);
        return x;
      });
    }
    return slot.building;
  };

  let hintTimer = null;
  function activate(slot) {
    slot.active = true;
    console.log('AR_TARGET_FOUND', slot.target.id);
    clearTimeout(hintTimer);
    hintEl.classList.remove('show');
    setTitle(SCENES[slot.target.scene].title);
    if (slot.exp) {
      slot.exp.resume();
      return;
    }
    loading(true);
    build(slot).then((x) => {
      loading(false);
      if (slot.active) x.start();
    }).catch((e) => { loading(false); caption('Could not load this memory: ' + e.message); });
  }
  function deactivate(slot) {
    slot.active = false;
    if (slot.exp) slot.exp.pause();
    loading(false);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (!slots.some((s) => s.active)) hintEl.classList.add('show');
    }, 700);
  }
  activeForSound = () => slots.filter((s) => s.active && s.exp).map((s) => s.exp);
  window.__mg = { slots, camera };   // handy for debugging from the console

  // warm up the memories of the chosen scene while the camera starts
  const preload = scene ? slots.filter((s) => String(s.target.scene) === sceneId) : [];
  preload.forEach((s) => build(s).catch(() => {}));

  await mindar.start();
  hintEl.classList.add('show');
  document.addEventListener('visibilitychange', () => {
    slots.forEach((s) => s.exp && s.active && (document.hidden ? s.exp.pause() : s.exp.resume()));
  });

  renderer.setAnimationLoop(() => {
    const now = performance.now() / 1000;
    const live = [];
    for (const s of slots) {
      if (s.active && !s.exp) {
        if (Math.floor(now / 1.4) !== s.ringN) { s.ringN = Math.floor(now / 1.4); s.ring.trigger(now, 0, 0); }
      }
      s.ring.update(now);
      if (s.exp && s.active) {
        s.exp.frame(camera);
        live.push(s.exp);
      }
    }
    speak(live, camera);
    renderer.render(world, camera);
  });
}

/* ---------------- scan hint: show the icons to look for ---------------- */
function buildHint() {
  const list = scene ? TARGETS.filter((t) => String(t.scene) === sceneId) : TARGETS;
  const row = hintEl.querySelector('.icons');
  row.innerHTML = '';
  for (const t of list) {
    const fig = document.createElement('figure');
    fig.innerHTML = `<img src="${t.img}" alt=""><figcaption>${t.label}</figcaption>`;
    row.appendChild(fig);
  }
}

/* ---------------- boot ---------------- */
if (mode === 'preview') {
  if (!scene) fail('Unknown scene.');
  else startPreview().catch((e) => { console.error(e); fail('Preview failed to start: ' + e.message); });
} else {
  $('ov-title').textContent = scene ? scene.title : 'Scan the Book';
  $('ov-sub').textContent = scene
    ? 'Point your camera at a “Scan Here” icon on the printed page of this scene. Any other page of the book works too.'
    : 'Point your camera at any “Scan Here” icon in the book, and its memory will come alive on the page.';
  setTitle(scene ? scene.title : 'The Memory Garden');
  buildHint();
  startBtn.addEventListener('click', () => {
    overlay.classList.add('hidden');
    // the tap that starts the camera also unlocks sound (the speaker button mutes it)
    sound.enable().then((ok) => {
      soundBtn.classList.toggle('on', !!ok);
      soundBtn.setAttribute('aria-pressed', String(!!ok));
    });
    loading(true, 'Starting the camera…');
    startAR().then(() => loading(false)).catch((e) => {
      console.error(e);
      loading(false);
      fail('Could not start AR: ' + e.message + ' — the page must be opened over HTTPS (or localhost) and camera permission must be allowed.');
    });
  });
}
