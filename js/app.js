// The Memory Garden launcher — two modes: 3D preview and augmented reality
import * as THREE from 'three';
import { OrbitControls } from '../libs/OrbitControls.js';
import { loadTextures, cutout, caption } from './engine.js';
import { build as buildScene1 } from './scenes/scene1.js';
import { build as buildScene7 } from './scenes/scene7.js';
import { build as buildScene8 } from './scenes/scene8.js';
import { build as buildScene9 } from './scenes/scene9.js';

const params = new URLSearchParams(location.search);
const sceneId = params.get('scene') || '1';
const mode = params.get('mode') || 'preview';

const BUILDERS = { 1: buildScene1, 7: buildScene7, 8: buildScene8, 9: buildScene9 };
const TARGET_INDEX = { 1: 0, 7: 1, 8: 2, 9: 3 };
const TITLES = {
  1: 'Scene 1 — Memories',
  7: 'Scene 7 — The Doll',
  8: 'Scene 8 — Planting Seeds',
  9: 'Scene 9 — The Memory Garden',
};

const overlay = document.getElementById('start-overlay');
const ovTitle = document.getElementById('ov-title');
const ovSub = document.getElementById('ov-sub');
const startBtn = document.getElementById('start-btn');
const errEl = document.getElementById('err');
document.getElementById('scene-title').textContent = TITLES[sceneId] || 'The Memory Garden';

function fail(msg) {
  overlay.classList.remove('hidden');
  startBtn.style.display = 'none';
  errEl.textContent = msg;
}

/* ---------------- Preview mode (no camera) ---------------- */
async function startPreview() {
  overlay.classList.add('hidden');
  const container = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xece4d4);
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.01, 50);
  camera.up.set(0, 0, 1);
  camera.position.set(0, -0.95, 0.6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0.12);
  controls.enableDamping = true;
  controls.minDistance = 0.35;
  controls.maxDistance = 2.4;
  controls.maxPolarAngle = 1.5;

  // The book page itself acts as the stage floor
  const pageArt = await loadTextures({ page: `scene${sceneId}/ground.png` });
  const page = cutout(pageArt.page, 1.0, { standing: false, anchor: 'center', renderOrder: -5 });
  scene.add(page);
  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6),
    new THREE.MeshBasicMaterial({ color: 0xd8cfbc })
  );
  table.position.z = -0.003;
  table.renderOrder = -10;
  scene.add(table);

  const { group, update } = await BUILDERS[sceneId]({ isAR: false });
  scene.add(group);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    update(clock.getElapsedTime());
    controls.update();
    renderer.render(scene, camera);
  });
}

/* ---------------- AR mode ---------------- */
async function startAR() {
  const { MindARThree } = await import('mindar-image-three');
  const mindar = new MindARThree({
    container: document.getElementById('app'),
    imageTargetSrc: './targets/targets.mind',
    maxTrack: 1,
    filterMinCF: 0.0005,
    filterBeta: 0.005,
  });
  const { renderer, scene, camera } = mindar;
  renderer.outputEncoding = THREE.sRGBEncoding;

  const anchor = mindar.addAnchor(TARGET_INDEX[sceneId]);
  const { group, update } = await BUILDERS[sceneId]({ isAR: true });
  anchor.group.add(group);

  anchor.onTargetFound = () => { console.log('AR_TARGET_FOUND'); caption(''); };
  anchor.onTargetLost = () => caption('Point the camera at the book page');

  await mindar.start();
  caption('Point the camera at the book page');

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    update(clock.getElapsedTime());
    renderer.render(scene, camera);
  });
}

/* ---------------- Boot ---------------- */
if (!BUILDERS[sceneId]) {
  fail('Invalid scene number.');
} else if (mode === 'preview') {
  startPreview().catch((e) => fail('Preview failed to start: ' + e.message));
} else {
  ovTitle.textContent = TITLES[sceneId];
  ovSub.textContent =
    'AR Mode needs camera access. After pressing Start, point the camera at the printed page of this scene in the book.';
  startBtn.addEventListener('click', () => {
    overlay.classList.add('hidden');
    startAR().catch((e) => {
      overlay.classList.remove('hidden');
      fail('Could not start AR: ' + e.message + ' — make sure the page is served over HTTPS or localhost and camera permission is granted.');
    });
  });
}
