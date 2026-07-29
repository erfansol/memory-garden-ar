// Scene 8 — "Planting Seeds": three seeds, three promises, and a garden growing taller
import * as THREE from 'three';
import {
  loadTextures, cutout, Drift, caption, mulberry32,
  seg, window01, lerp, easeInOut, easeOut, easeOutBack, pulse,
} from '../engine.js';

const LOOP = 32;

// The three planting spots (matching the printed soil mounds on the page)
const SPOTS = [
  { x: -0.28, y: -0.04 },
  { x: 0.00, y: -0.13 },
  { x: 0.26, y: -0.06 },
];
const MSGS = [
  '“I cannot bring you back, but I can keep your memory with kindness.”',
  '“Every time I remember you, something small grows inside me.”',
  '“Memories do not end; they only change their shape.”',
];
// Timing: entrance, then three planting stops
const PLANT_AT = [5, 13, 21];

export async function build(ctx) {
  const T = await loadTextures({
    girl: 'scene8/girl_stand.png',
    small: 'scene8/bush_small.png',
    medium: 'scene8/bush_medium.png',
    tall: 'scene8/bush_tall.png',
    seed: 'common/seed.png',
    sprout: 'common/sprout.png',
    ring: 'common/ring.png',
    glow: 'common/glow.png',
    petal: 'common/petal.png',
  });

  const g = new THREE.Group();

  // The garden's three growth stages at the back of the page
  const small = cutout(T.small, 0.62, { renderOrder: 2, opacity: 0 });
  const medium = cutout(T.medium, 0.82, { renderOrder: 3, opacity: 0 });
  const tall = cutout(T.tall, 1.0, { renderOrder: 4, opacity: 0 });
  small.position.set(0, 0.30, 0);
  medium.position.set(0, 0.305, 0);
  tall.position.set(0, 0.31, 0);
  g.add(small, medium, tall);

  // The girl (paper doll) + a small shadow under her feet
  const girl = cutout(T.girl, 0.17, { renderOrder: 10 });
  g.add(girl);
  const girlShadow = cutout(T.glow, 0.12, { standing: false, anchor: 'center', renderOrder: 5 });
  girlShadow.material.color.set(0x2a2015);
  girlShadow.scale.y = 0.45;
  g.add(girlShadow);

  // For each planting spot: a seed, a glow ring, and a sprout
  const stations = SPOTS.map((s, i) => {
    const seed = cutout(T.seed, 0.022, { anchor: 'center', renderOrder: 11 });
    const ring = cutout(T.ring, 0.10, { standing: false, anchor: 'center', renderOrder: 5 });
    const sprout = cutout(T.sprout, 0.05, { renderOrder: 6 });
    ring.position.set(s.x, s.y, 0.004);
    sprout.position.set(s.x, s.y, 0);
    seed.material.opacity = 0;
    ring.material.opacity = 0;
    sprout.scale.setScalar(0.001);
    g.add(seed, ring, sprout);
    return { seed, ring, sprout, ...s };
  });

  const petals = new Drift(g, T.petal, { count: 14, mode: 'across', seed: 55, size: 0.02, speed: 0.05, opacity: 0.8, zRange: [0.05, 0.3], yRange: [-0.2, 0.25] });

  // The girl's path: enters from the right and walks between the spots
  const PATH = [
    { t0: 0.5, t1: 3.5, from: { x: 0.58, y: -0.02 }, to: { x: SPOTS[0].x + 0.13, y: SPOTS[0].y + 0.02 } },
    { t0: 9.0, t1: 11.5, from: { x: SPOTS[0].x + 0.13, y: SPOTS[0].y + 0.02 }, to: { x: SPOTS[1].x + 0.13, y: SPOTS[1].y + 0.02 } },
    { t0: 17.0, t1: 19.5, from: { x: SPOTS[1].x + 0.13, y: SPOTS[1].y + 0.02 }, to: { x: SPOTS[2].x + 0.13, y: SPOTS[2].y + 0.02 } },
    { t0: 25.0, t1: 27.5, from: { x: SPOTS[2].x + 0.13, y: SPOTS[2].y + 0.02 }, to: { x: 0.58, y: -0.02 } },
  ];

  function girlPos(tl) {
    let x = PATH[0].from.x, y = PATH[0].from.y, moving = 0;
    for (const p of PATH) {
      if (tl >= p.t1) { x = p.to.x; y = p.to.y; }
      else if (tl >= p.t0) {
        const k = seg(tl, p.t0, p.t1 - p.t0);
        x = lerp(p.from.x, p.to.x, k);
        y = lerp(p.from.y, p.to.y, k);
        moving = Math.sin(seg(tl, p.t0, p.t1 - p.t0, (v) => v) * Math.PI);
        break;
      } else break;
    }
    return { x, y, moving };
  }

  function update(t) {
    const tl = t % LOOP;

    // The girl
    const { x, y, moving } = girlPos(tl);
    const bob = moving * Math.abs(Math.sin(tl * 6.5)) * 0.014;
    girl.position.set(x, y, bob);
    // A small lean while planting
    let lean = 0;
    for (const pt of PLANT_AT) lean = Math.max(lean, Math.sin(seg(tl, pt - 0.4, 1.6, easeInOut) * Math.PI));
    girl.rotation.z = -lean * 0.18;
    girl.scale.setScalar(1 - lean * 0.04);
    const gvis = window01(tl, 0.5, LOOP - 3.5, 1.0);
    girl.material.opacity = gvis;
    // Walking direction: mirror when heading left
    girl.scale.x = (moving > 0.02 && tl < 20 ? -1 : 1) * Math.abs(girl.scale.x);
    girlShadow.position.set(x, y, 0.004);
    girlShadow.material.opacity = gvis * 0.22;

    // Planting stations
    stations.forEach((st, i) => {
      const pt = PLANT_AT[i];
      // The seed arcs from the girl's hand into the soil
      const k = seg(tl, pt, 0.9, (v) => v * v);
      const vis = window01(tl, pt, 0.9, 0.15);
      const sx = lerp(st.x + 0.10, st.x, k);
      const sz = 0.12 * (1 - k) + 0.10 * Math.sin(Math.PI * k);
      st.seed.position.set(sx, st.y, Math.max(0.008, sz));
      st.seed.material.opacity = vis;
      st.seed.rotation.z = k * 5;
      // Glow ring once the seed lands
      const ringK = seg(tl, pt + 0.85, 1.4, easeOut);
      st.ring.material.opacity = ringK > 0 ? (1 - ringK) * 0.85 : 0;
      st.ring.scale.setScalar(0.5 + ringK * 1.8);
      // The sprout
      const grow = seg(tl, pt + 1.1, 1.2, easeOutBack);
      const sway = 0.06 * Math.sin(t * 2 + i * 2);
      st.sprout.scale.set(Math.max(0.001, grow), Math.max(0.001, grow), 1);
      st.sprout.rotation.z = sway * grow;
      // Fade out near the end of the loop
      st.sprout.material.opacity = window01(tl, pt + 1.1, LOOP - pt - 2.5, 1.0);
    });

    // The garden grows one stage after each planting
    const g1 = seg(tl, PLANT_AT[0] + 1.6, 2.2, easeOut);
    const g2 = seg(tl, PLANT_AT[1] + 1.6, 2.2, easeOut);
    const g3 = seg(tl, PLANT_AT[2] + 1.6, 2.6, easeOut);
    const fadeAll = 1 - seg(tl, LOOP - 1.8, 1.6);

    small.scale.y = lerp(0.001, 1, g1);
    small.material.opacity = g1 * (1 - g2 * 0.85) * fadeAll;
    medium.scale.y = lerp(0.4, 1, g2);
    medium.material.opacity = g2 * (1 - g3 * 0.9) * fadeAll;
    tall.scale.y = lerp(0.5, 1, g3);
    tall.material.opacity = g3 * fadeAll;
    // The garden breathes softly
    const breathe = 1 + 0.006 * Math.sin(t * 1.1);
    tall.scale.x = breathe;
    medium.scale.x = breathe;

    // Petals after the final growth
    petals.set(g3 * fadeAll);
    petals.update(t);

    // The message for each planting
    let msg = '';
    stations.forEach((st, i) => {
      if (window01(tl, PLANT_AT[i] + 1.4, 5.6, 0.6) > 0.5) msg = MSGS[i];
    });
    caption(msg);
  }

  return { group: g, update };
}
