// Where Memories Grow player — Preview (3D, no camera) and AR (camera + printed book)
import * as THREE from 'three';
import { OrbitControls } from '../libs/OrbitControls.js';
import { loadTexture, caption } from './engine.js';
import { TARGETS, PAGE_H } from './layout.js';
import { Stage } from './tracking.js';
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
  if (params.get('bg')) { world.background.set('#' + params.get('bg')); table.material.color.set('#' + params.get('bg')); }
  const pageTex = (await loadTexture(`assets/scene${sceneId}/ground.jpg`)).tex;
  const page = new THREE.Mesh(new THREE.PlaneGeometry(1, PAGE_H), new THREE.MeshBasicMaterial({ map: pageTex }));
  world.add(page);
  world.add(await scene.mod.popup());

  loading(true, 'Loading the memories…');
  const exps = await Promise.all(Object.values(scene.mod.STATIONS).map((b) => b()));
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
// Every spread has two targets (its left and right leaf). Both lead to the same memory,
// shown on a Stage that follows whichever leaf is visible (js/tracking.js).
const PAUSE_AFTER = 3.0;      // keep the memory playing through tracking drop-outs this long (s)

async function startAR() {
  const { MindARThree } = await import('mindar-image-three');
  const mindar = new MindARThree({
    container: $('app'),
    // a scene's own targets when a scene was chosen (faster), otherwise every scene's
    imageTargetSrc: scene ? `./targets/scene${sceneId}.mind` : './targets/all.mind',
    maxTrack: 1,
    uiLoading: 'no',
    uiScanning: 'no',
    uiError: 'no',
    // light filtering inside MindAR; the Stage does the real smoothing on every frame
    filterMinCF: 0.004,
    filterBeta: 0.02,
    warmupTolerance: 2,
    missTolerance: 12,
  });
  const { renderer, scene: world, camera } = mindar;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  // per scene: a stage, its target slots and (once built) its memories
  const scenes = {};
  for (const id of Object.keys(SCENES)) scenes[id] = { id, stage: new Stage(world), slots: [], exps: null, building: null, running: false, lostAt: 0 };
  const targets = scene ? TARGETS.filter((t) => String(t.scene) === sceneId) : TARGETS;   // same order as the .mind file
  targets.forEach((target, i) => {
    const anchor = mindar.addAnchor(i);
    const ring = new GroundRing(anchor.group, { size: 1.1, color: 0xfff0c8, dur: 1.4 });
    const sc = scenes[target.scene];
    sc.slots.push({ target, anchor, ring, G: target.G, ref: [{ L: -0.25, R: 0.25 }[target.leaf] ?? 0, 0] });
  });

  const build = (sc) => {
    if (!sc.building) {
      sc.building = Promise.all(Object.values(SCENES[sc.id].mod.STATIONS).map((b) => b())).then((exps) => {
        exps.forEach((x) => sc.stage.group.add(x.group));
        sc.exps = exps;
        return exps;
      });
    }
    return sc.building;
  };
  const running = () => Object.values(scenes).filter((sc) => sc.running && sc.exps);
  activeForSound = () => running().flatMap((sc) => sc.exps);

  window.__mg = {                    // handy for debugging, and used by tools/targets/eval_photos.mjs
    scenes, camera, started: false,
    status: () => {
      const sc = Object.values(scenes).find((x) => x.tracked);
      const r = { tracked: !!sc, id: sc ? sc.stage.current.target.id : null, camT: mindar.video ? mindar.video.currentTime : 0 };
      if (sc) {
        _p.setFromMatrixPosition(sc.stage.root.matrix).project(camera);
        r.sx = (_p.x * 0.5 + 0.5) * innerWidth; r.sy = (-_p.y * 0.5 + 0.5) * innerHeight;
      }
      return r;
    },
  };

  // warm up the memories of the chosen scene while the camera starts
  if (scene) build(scenes[sceneId]).catch(() => {});

  await mindar.start();
  window.__mg.started = true;
  hintEl.classList.add('show');
  document.addEventListener('visibilitychange', () => {
    running().forEach((sc) => sc.exps.forEach((x) => (document.hidden ? x.pause() : x.resume())));
  });

  let last = performance.now() / 1000;
  let lastAny = -1e9;
  renderer.setAnimationLoop(() => {
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - last);
    last = now;
    const live = [];
    for (const sc of Object.values(scenes)) {
      const st = sc.stage.update(sc.slots, now, dt);
      sc.tracked = st.tracked;
      if (st.tracked) {
        lastAny = now;
        setTitle(SCENES[sc.id].title);
        if (!sc.exps) {
          // a soft pulsing ring on the page while its memory loads
          for (const s of sc.slots) if (Math.floor(now / 1.4) !== s.ringN) { s.ringN = Math.floor(now / 1.4); s.ring.trigger(now, 0, 0); }
          if (!sc.building) { loading(true); build(sc).then(() => loading(false)).catch((e) => { loading(false); caption('Could not load this memory: ' + e.message); }); }
        } else if (!sc.running) {
          sc.running = true;
          if (!sc.everStarted) {
            sc.everStarted = true;
            sc.exps.forEach((x, i) => setTimeout(() => x.start(), i * 700));
          } else sc.exps.forEach((x) => x.resume());
        }
      } else if (sc.running && st.lostFor > PAUSE_AFTER) {
        // gone for a while: pause (it picks up where it was, or restarts after a long break)
        sc.running = false;
        sc.exps.forEach((x) => x.pause());
      }
      for (const s of sc.slots) s.ring.update(now);
      if (sc.running && sc.exps) {
        for (const x of sc.exps) { if (x.started) x.frame(camera); }
        if (st.shown) live.push(...sc.exps);
      }
    }
    hintEl.classList.toggle('show', now - lastAny > 1.2);
    speak(live, camera);
    renderer.render(world, camera);
  });
}

/* ---------------- scan hint: which pages can be scanned ---------------- */
function buildHint() {
  const ids = scene ? [sceneId] : Object.keys(SCENES);
  for (const row of [hintEl.querySelector('.icons'), $('ov-icons')]) {
    row.innerHTML = '';
    for (const id of ids) {
      const fig = document.createElement('figure');
      fig.innerHTML = `<img src="assets/testpages/scene${id}_thumb.jpg" alt=""><figcaption>Scene ${id}</figcaption>`;
      row.appendChild(fig);
    }
  }
}

/* ---------------- boot ---------------- */
if (mode === 'preview') {
  if (scene) document.title = scene.title + ' · Where Memories Grow';
  if (!scene) fail('Unknown scene.');
  else startPreview().catch((e) => { console.error(e); fail('Preview failed to start: ' + e.message); });
} else {
  $('ov-title').textContent = scene ? scene.title : 'Scan the Book';
  $('ov-sub').textContent = scene
    ? 'Point your camera at this spread of the book. The other scenes work too.'
    : 'Open the book at a scene and point your camera at the pages: the memory comes alive on the paper.';
  document.title = (scene ? scene.title : 'Scan the Book') + ' · Where Memories Grow';
  setTitle(scene ? scene.title : 'Where Memories Grow');
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
