// Scene 1 — "Memories": the classroom, shadow play, and the cycle of seasons
import * as THREE from 'three';
import {
  loadTextures, cutout, Drift, caption,
  seg, window01, lerp, easeOutBack, easeInOut, pulse,
} from '../engine.js';

const LOOP = 36;          // three seasons × 12 seconds
const SEASON = 12;

export async function build(ctx) {
  const T = await loadTextures({
    wall: 'scene1/wall.png',
    girl: 'scene1/girl_desk.png',
    boy: 'scene1/boy_desk.png',
    packs: 'scene1/backpacks.png',
    gsh: 'scene1/girl_shadow.png',
    bsh: 'scene1/boy_shadow.png',
    leaf: 'common/leaf.png',
    snow: 'common/snow.png',
    rain: 'common/rain.png',
    petal: 'common/petal.png',
    sparkle: 'common/sparkle.png',
    ring: 'common/ring.png',
    glow: 'common/glow.png',
  });

  const g = new THREE.Group();

  // Classroom wall standing at the back of the page
  const wall = cutout(T.wall, 1.0, { renderOrder: 1 });
  wall.position.set(0, 0.3, 0);
  g.add(wall);

  // Summer sun glow on the wall
  const sun = cutout(T.glow, 0.16, { anchor: 'center', renderOrder: 2 });
  sun.position.set(0.36, 0.29, 0.40);
  g.add(sun);

  // The children's shadows on the wall (shadow play!)
  const gsh = cutout(T.gsh, 0.22, { renderOrder: 3, opacity: 0.4 });
  const bsh = cutout(T.bsh, 0.22, { renderOrder: 3, opacity: 0.4 });
  gsh.position.set(-0.20, 0.288, 0.03);
  bsh.position.set(0.20, 0.288, 0.03);
  g.add(gsh, bsh);

  // The children at their desks + the backpacks
  const girl = cutout(T.girl, 0.21, { renderOrder: 6 });
  const boy = cutout(T.boy, 0.21, { renderOrder: 6 });
  const packs = cutout(T.packs, 0.15, { renderOrder: 7 });
  girl.position.set(-0.18, 0.12, 0);
  boy.position.set(0.18, 0.12, 0);
  packs.position.set(0, -0.04, 0);
  g.add(girl, boy, packs);

  // Glow ring over the snow angels printed on the left of the page
  const angelGlow = cutout(T.ring, 0.16, { standing: false, anchor: 'center', renderOrder: 4 });
  angelGlow.position.set(-0.33, 0.02, 0.004);
  g.add(angelGlow);

  // Season-change sparkles around the children
  const sparkles = [];
  for (let i = 0; i < 10; i++) {
    const s = cutout(T.sparkle, 0.028, { anchor: 'center', renderOrder: 9 });
    g.add(s);
    sparkles.push(s);
  }

  // Seasonal particles
  const petals = new Drift(g, T.petal, { count: 16, mode: 'float', seed: 11, size: 0.02, opacity: 0.85, zRange: [0.06, 0.34], yRange: [-0.25, 0.25] });
  const leaves = new Drift(g, T.leaf, { count: 26, mode: 'fall', seed: 22, size: 0.024, speed: 0.07, spin: 2.2 });
  const rain = new Drift(g, T.rain, { count: 34, mode: 'fall', seed: 33, size: 0.03, speed: 0.5, sway: 0.004, spin: 0, opacity: 0.5 });
  const snow = new Drift(g, T.snow, { count: 40, mode: 'fall', seed: 44, size: 0.016, speed: 0.045, sway: 0.05 });

  const SEASONS = [
    'A summer memory — playing with shadows',
    'An autumn memory — under the rain',
    'A winter memory — snow angels',
  ];

  function update(t) {
    const tl = t % LOOP;
    const si = Math.floor(tl / SEASON);        // current season 0..2
    const ts = tl - si * SEASON;               // time within the season

    // Loop intro: the desks pop up out of the page
    const intro = tl < 2.2 ? seg(tl, 0.2, 2.0, easeOutBack) : 1;
    const popG = tl < 2.2 ? seg(tl, 0.2, 1.6, easeOutBack) : 1;
    const popB = tl < 2.2 ? seg(tl, 0.55, 1.6, easeOutBack) : 1;
    girl.scale.setScalar(Math.max(0.001, popG));
    boy.scale.setScalar(Math.max(0.001, popB));
    packs.scale.setScalar(Math.max(0.001, intro));

    // Sims-style spin at the season change + sparkle burst
    const spinK = seg(ts, SEASON - 1.3, 1.15, easeInOut);
    const spinA = spinK * Math.PI * 4;
    girl.rotation.y = spinA;
    boy.rotation.y = -spinA;

    // The children's playful rhythm (gentle hopping)
    const hop = (ph) => Math.abs(Math.sin(t * 2.4 + ph)) * 0.012;
    girl.position.z = hop(0);
    boy.position.z = hop(1.3);
    girl.scale.y = girl.scale.x * (1 - 0.05 * Math.sin(t * 4.8));
    boy.scale.y = boy.scale.x * (1 - 0.05 * Math.sin(t * 4.8 + 2.6));

    // Shadows: slightly larger and more playful than the children
    const shadowDance = Math.sin(t * 1.1) * 0.02;
    gsh.position.x = -0.20 + shadowDance;
    bsh.position.x = 0.20 - shadowDance;
    gsh.scale.setScalar(1.02 + 0.07 * Math.sin(t * 0.9));
    bsh.scale.setScalar(1.02 + 0.07 * Math.sin(t * 0.9 + 1.6));
    gsh.position.z = 0.03 + hop(0) * 1.6;
    bsh.position.z = 0.03 + hop(1.3) * 1.6;
    const shadowOn = window01(tl, 0.8, LOOP - 1.6, 1.2) * 0.42;
    gsh.material.opacity = shadowOn;
    bsh.material.opacity = shadowOn;

    // Season-change sparkles
    const burst = Math.sin(spinK * Math.PI);
    sparkles.forEach((s, i) => {
      const side = i < 5 ? -0.18 : 0.18;
      const a = t * 2 + i * 1.7;
      s.position.set(side + 0.09 * Math.cos(a), 0.11, 0.10 + 0.07 * Math.sin(a));
      s.material.opacity = burst * 0.9;
      s.rotation.z = a;
    });

    // Seasons: particles fade smoothly in and out
    const w = (idx) => (si === idx ? window01(ts, 0, SEASON, 1.6) : 0);
    petals.set(w(0)); petals.update(t);
    leaves.set(w(1)); leaves.update(t);
    rain.set(w(1) * 0.8); rain.update(t);
    snow.set(w(2)); snow.update(t);

    // Sun in summer; snow-angel glow in winter
    sun.material.opacity = w(0) * (0.55 + 0.25 * pulse(t, 3));
    sun.rotation.z = t * 0.2;
    angelGlow.material.opacity = w(2) * (0.5 + 0.4 * pulse(t, 2.2));
    angelGlow.scale.setScalar(1 + 0.15 * pulse(t, 2.2));

    caption(window01(ts, 0.8, 4.5, 0.7) > 0.5 ? SEASONS[si] : '');
  }

  return { group: g, update };
}
