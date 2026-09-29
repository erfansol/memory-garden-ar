// Page geometry and the six "Scan Here" targets of the book.
//
// Scene content is authored in PAGE units: the whole open spread is 1 unit wide,
// the origin is the centre of the spread, X points right, Y points to the top edge
// of the printed page and Z points up out of the paper.
//
// MindAR tracks the small printed icons, so every experience is wrapped in a group
// that maps page units onto the coordinate system of its icon.

export const PAGE_PX = { w: 3513, h: 2484 };       // size of the ground-page artwork
export const PAGE_H = PAGE_PX.h / PAGE_PX.w;        // page height in page units (0.707)

// Order = order of the images compiled into targets/targets.mind
// center / width: where the icon sits on its ground page, in artwork pixels
export const TARGETS = [
  { id: 's1_spring', scene: 1, label: 'Sunflower', img: 'targets/s1_spring.jpg', center: [3222.0, 720.5], width: 480 },
  { id: 's1_autumn', scene: 1, label: 'Umbrellas', img: 'targets/s1_autumn.jpg', center: [2255.0, 281.0], width: 636 },
  { id: 's1_winter', scene: 1, label: 'Snowman', img: 'targets/s1_winter.jpg', center: [420.5, 483.0], width: 627 },
  { id: 's7_bunny', scene: 7, label: 'Bunny', img: 'targets/s7_bunny.jpg', center: [2863.5, 1500.0], width: 777 },
  { id: 's8_hole', scene: 8, label: 'Seed hole', img: 'targets/s8_hole.jpg', center: [2849.5, 1459.5], width: 751 },
  { id: 's9_flower', scene: 9, label: 'Flower bush', img: 'targets/s9_flower.jpg', center: [2940.0, 1242.0], width: 484 },
];

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

export function targetById(id) {
  return TARGETS.find((t) => t.id === id);
}

export function targetIndex(id) {
  return TARGETS.findIndex((t) => t.id === id);
}
