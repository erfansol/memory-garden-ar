// Scene 9 — "The Memory Garden": a poetic moment of wind, flowers, and paper planes
import * as THREE from 'three';
import {
  loadTextures, cutout, Drift, caption, flyOn,
  seg, window01, lerp, pulse, easeInOut,
} from '../engine.js';

const LOOP = 24;

export async function build(ctx) {
  const T = await loadTextures({
    girl: 'scene9/girl_full.png',
    hairBack: 'scene9/hair_back.png',
    bush1: 'scene9/bushflow1.png',
    bush2: 'scene9/bushflow2.png',
    bush3: 'scene9/bushflow3.png',
    petal: 'common/petal.png',
    snowdot: 'common/snow.png',
    plane: 'common/paperplane.png',
    glow: 'common/glow.png',
  });

  const g = new THREE.Group();

  // Three frames of the back bushes (cross-fade = wind)
  const backFrames = [T.bush1, T.bush2, T.bush3].map((a, i) => {
    const m = cutout(a, 1.06, { renderOrder: 2 + i });
    m.position.set(0, 0.31, 0);
    g.add(m);
    return m;
  });
  // The front row (in front of the girl, like the book itself)
  const frontFrames = [T.bush2, T.bush3, T.bush1].map((a, i) => {
    const m = cutout(a, 0.85, { renderOrder: 20 + i });
    m.position.set(0, -0.17, 0);
    g.add(m);
    return m;
  });

  // The background hair + the girl herself
  const hair = cutout(T.hairBack, 0.46, { renderOrder: 8 });
  hair.position.set(0, 0.145, 0);
  const girl = cutout(T.girl, 0.54, { renderOrder: 9 });
  girl.position.set(0, 0.13, 0);
  g.add(hair, girl);

  // Ambient glows
  const glows = [];
  for (let i = 0; i < 3; i++) {
    const gl = cutout(T.glow, 0.34, { anchor: 'center', renderOrder: 30 });
    gl.position.set(-0.3 + i * 0.3, 0.1, 0.35);
    g.add(gl);
    glows.push(gl);
  }

  // Paper planes travelling on the wind
  const planes = [];
  for (let i = 0; i < 3; i++) {
    const p = cutout(T.plane, 0.06, { anchor: 'center', renderOrder: 31 });
    g.add(p);
    planes.push(p);
  }

  // Petals at two depths
  const petalsA = new Drift(g, T.petal, { count: 22, mode: 'across', seed: 91, size: 0.02, speed: 0.055, opacity: 0.9, zRange: [0.08, 0.42], yRange: [-0.15, 0.3] });
  const petalsB = new Drift(g, T.snowdot, { count: 18, mode: 'float', seed: 92, size: 0.012, opacity: 0.6, zRange: [0.1, 0.4], yRange: [-0.2, 0.3] });

  // Weights of the three frames for a smooth looping cross-fade
  function frameWeights(t, period) {
    const ph = (t / period) % 3;
    return [0, 1, 2].map((i) => {
      let d = Math.abs(ph - i);
      d = Math.min(d, 3 - d);
      return Math.max(0, 1 - d);
    });
  }

  function update(t) {
    const tl = t % LOOP;

    // Wind through the bushes: cross-fading frames + a subtle sway
    const wBack = frameWeights(t, 1.15);
    const wFront = frameWeights(t + 0.55, 1.35);
    backFrames.forEach((m, i) => {
      m.material.opacity = wBack[i];
      m.rotation.z = 0.008 * Math.sin(t * 0.9 + i);
    });
    frontFrames.forEach((m, i) => {
      m.material.opacity = wFront[i];
      m.rotation.z = -0.010 * Math.sin(t * 0.8 + i * 1.3);
    });

    // Breathing and the waves of her hair
    hair.rotation.z = 0.030 * Math.sin(t * 0.65);
    hair.scale.set(1 + 0.010 * Math.sin(t * 0.65 + 1), 1 + 0.006 * Math.sin(t * 0.5), 1);
    girl.rotation.z = 0.010 * Math.sin(t * 0.65 + 0.5);
    girl.scale.y = 1 + 0.005 * Math.sin(t * 0.9);

    // Glows
    glows.forEach((gl, i) => {
      gl.material.opacity = 0.10 + 0.06 * pulse(t + i * 1.2, 5);
      gl.position.z = 0.32 + 0.05 * Math.sin(t * 0.4 + i * 2);
    });

    // Paper planes: slow, looping journeys
    planes.forEach((p, i) => {
      const dur = 9, start = i * 3.2;
      const k = seg(tl, start, dur, easeInOut);
      const vis = window01(tl, start, dur, 1.0);
      const dir = i % 2 === 0 ? 1 : -1;
      flyOn(p, k,
        [-0.55 * dir, 0.05 + i * 0.06, 0.14 + i * 0.05],
        [0, 0.28, 0.34],
        [0.55 * dir, -0.05 + i * 0.04, 0.18],
        t + i * 3);
      p.material.opacity = vis * 0.95;
    });

    petalsA.update(t);
    petalsB.update(t);

    caption(window01(tl, 1.2, 4.2, 0.8) > 0.5 ? 'The Memory Garden — where memories stay alive' : '');
  }

  return { group: g, update };
}
