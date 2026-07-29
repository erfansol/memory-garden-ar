// Scene 7 — "The Doll": a breeze, paper planes, and holding the doll close
import * as THREE from 'three';
import {
  loadTextures, cutout, caption, flyOn,
  seg, window01, lerp, easeInOut, easeOut, easeOutBack, pulse,
} from '../engine.js';

const LOOP = 27;

export async function build(ctx) {
  const T = await loadTextures({
    wall: 'scene7/wall.png',
    bed: 'scene7/bed.png',
    girl: 'scene7/girl.png',
    bunny: 'scene7/bunny.png',
    plane: 'common/paperplane.png',
    glow: 'common/glow.png',
    heart: 'common/heart.png',
    ring: 'common/ring.png',
  });

  const g = new THREE.Group();

  // Bedroom wall with the night window
  const wall = cutout(T.wall, 1.04, { renderOrder: 1 });
  wall.position.set(0, 0.30, 0);
  g.add(wall);

  // Moonlight beside the window
  const moon = cutout(T.glow, 0.20, { anchor: 'center', renderOrder: 2, opacity: 0.5 });
  moon.position.set(-0.235, 0.295, 0.30);
  g.add(moon);

  // The bed and the girl
  const bed = cutout(T.bed, 0.42, { renderOrder: 6 });
  bed.position.set(0.26, 0.06, 0);
  const girl = cutout(T.girl, 0.20, { renderOrder: 5 });
  girl.position.set(0.26, 0.10, 0.04);
  g.add(bed, girl);

  // The bunny doll + its inviting glow
  const bunny = cutout(T.bunny, 0.11, { renderOrder: 7 });
  bunny.position.set(-0.20, -0.10, 0);
  const bunnyGlow = cutout(T.glow, 0.16, { standing: false, anchor: 'center', renderOrder: 3 });
  bunnyGlow.position.set(-0.20, -0.10, 0.004);
  g.add(bunny, bunnyGlow);

  // Paper planes and loose pages carried by the breeze
  const planes = [];
  for (let i = 0; i < 3; i++) {
    const p = cutout(T.plane, 0.07, { anchor: 'center', renderOrder: 8 });
    g.add(p);
    planes.push(p);
  }
  const papers = [];
  const paperMat = new THREE.MeshBasicMaterial({ color: 0xfdf7ea, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.06), paperMat.clone());
    m.renderOrder = 8;
    g.add(m);
    papers.push(m);
  }

  // Hearts for the hug moment
  const hearts = [];
  for (let i = 0; i < 5; i++) {
    const h = cutout(T.heart, 0.03, { anchor: 'center', renderOrder: 9 });
    g.add(h);
    hearts.push(h);
  }

  function update(t) {
    const tl = t % LOOP;

    // The moon breathes softly
    moon.material.opacity = 0.35 + 0.2 * pulse(t, 4);

    // 0-2: the room settles | 2-9: breeze and papers
    const breeze = window01(tl, 2, 8, 1.2);
    planes.forEach((p, i) => {
      const dur = 4.5, start = 2 + i * 1.6;
      const k = seg(tl, start, dur, easeInOut);
      const vis = window01(tl, start, dur, 0.5);
      flyOn(p, k,
        [-0.34 + i * 0.05, 0.24, 0.30 + i * 0.04],
        [0.02 + i * 0.06, 0.05, 0.22],
        [0.16 - i * 0.16, -0.16 + i * 0.05, 0.005],
        t + i * 2.1);
      p.material.opacity = vis * 0.95;
    });
    papers.forEach((m, i) => {
      const start = 2.6 + i * 1.1, dur = 3.6;
      const k = seg(tl, start, dur, easeInOut);
      const vis = window01(tl, start, dur, 0.5);
      m.position.set(
        lerp(-0.30 + i * 0.04, -0.05 + i * 0.09, k),
        lerp(0.22, -0.13 + i * 0.03, k),
        lerp(0.26, 0.006, k) + 0.02 * Math.sin(t * 5 + i)
      );
      m.rotation.set(Math.PI / 2 + 0.6 * Math.sin(t * 3 + i), 0.5 * Math.sin(t * 2.2 + i * 2), 0);
      m.material.opacity = vis * 0.9;
    });

    // The doll's inviting glow until it is picked up
    const invite = window01(tl, 1, 10.5, 1.5);
    bunnyGlow.material.opacity = invite * (0.35 + 0.35 * pulse(t, 1.8));
    bunnyGlow.scale.setScalar(1 + 0.18 * pulse(t, 1.8));

    // 9.5-12.5: the girl climbs out of bed and moves to the center
    const walk = seg(tl, 9.5, 3.0);
    const gx = lerp(0.26, 0.015, walk);
    const gy = lerp(0.10, -0.055, walk);
    const hopz = walk > 0 && walk < 1 ? Math.abs(Math.sin(tl * 7)) * 0.012 : 0;
    girl.position.set(gx, gy, 0.04 * (1 - walk) + hopz);
    girl.scale.setScalar(lerp(0.85, 1.0, walk));
    girl.renderOrder = walk > 0.4 ? 8 : 5;

    // 12-14: the doll comes to the girl (she picks it up)
    const pick = seg(tl, 12.2, 1.8, easeOut);
    const hug = seg(tl, 14.2, 1.4, easeOutBack);
    // Gentle reset at the end of the loop
    const reset = seg(tl, LOOP - 2.2, 1.8);

    const bx = lerp(lerp(-0.20, 0.015, pick), 0.015, hug);
    const by = lerp(lerp(-0.10, -0.075, pick), -0.075, hug);
    const rockA = hug * 0.09 * Math.sin(t * 2.1);
    bunny.position.set(lerp(bx, -0.20, reset), lerp(by, -0.10, reset), lerp(hug * 0.055, 0, reset));
    bunny.rotation.y = rockA;
    bunny.scale.setScalar(lerp(1, 1.06, hug));

    // The girl returns as the loop closes
    if (reset > 0) {
      girl.position.x = lerp(gx, 0.26, reset);
      girl.position.y = lerp(gy, 0.10, reset);
      girl.position.z = lerp(girl.position.z, 0.04, reset);
      girl.scale.setScalar(lerp(1.0, 0.85, reset));
    }
    // Gentle rocking during the hug (a lullaby sway)
    girl.rotation.y = hug * (1 - reset) * 0.05 * Math.sin(t * 2.1);

    // Hearts after the hug
    hearts.forEach((h, i) => {
      const start = 15 + i * 0.7, dur = 2.6;
      const k = seg(tl, start, dur, easeOut);
      const vis = window01(tl, start, dur, 0.6);
      h.position.set(0.015 + (i - 2) * 0.035 + 0.012 * Math.sin(t * 2 + i * 2), -0.09, 0.10 + k * 0.16);
      h.material.opacity = vis * 0.9;
      h.scale.setScalar(0.8 + 0.4 * k);
    });

    // Messages
    let msg = '';
    if (window01(tl, 3.2, 4.5, 0.6) > 0.5) msg = 'A soft breeze drifts in from the window…';
    else if (window01(tl, 15.2, 4.6, 0.6) > 0.5) msg = '“You are not alone.”';
    else if (window01(tl, 20.4, 4.4, 0.6) > 0.5) msg = '“I am here; you can rest now.”';
    caption(msg);
  }

  return { group: g, update };
}
