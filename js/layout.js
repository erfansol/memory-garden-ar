// Page geometry and the tracked targets of the book.
//
// Scene content is authored in PAGE units: the whole open spread is 1 unit wide,
// the origin is the centre of the spread, X points right, Y points to the top edge
// of the printed page and Z points up out of the paper.
//
// MindAR tracks each leaf of the open spread, so content is mapped from page units onto
// the coordinate system of whichever leaf is being tracked.

export const PAGE_PX = { w: 3513, h: 2484 };       // size of the ground-page artwork
export const PAGE_H = PAGE_PX.h / PAGE_PX.w;        // page height in page units (0.707)

// The tracked targets: each leaf of each printed spread (see tools/targets/build_targets.py).
// center / width: where the target sits on its ground page, in artwork pixels.
export { default as TARGETS } from '../targets/targets.js';

// Artwork pixel -> page units
export function px(x, y) {
  return [x / PAGE_PX.w - 0.5, PAGE_H / 2 - y / PAGE_PX.w];
}

// Transform that places page-unit content onto a target's anchor (target width = 1 unit)
export function pageToTarget(target) {
  const s = PAGE_PX.w / target.width;
  const [cx, cy] = px(target.center[0], target.center[1]);
  return { scale: s, x: -cx * s, y: -cy * s };
}

