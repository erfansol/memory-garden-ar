"""Builds the AR tracking targets from the pages as they are actually printed.

    python3 tools/targets/build_targets.py && node tools/compile-targets.mjs

Why: the printed book (see the photos in ../newtargetpoints) is not the same as the
"AR targeted" digital pages. Most small "Scan Here" icons were never printed, the
pop-up covers the middle of every spread, and the two leaves of an open pop-up book
are not one plane. So each spread becomes two large targets, one per leaf:

- icons that are not in the print are painted out (checked against the photos)
- the area under/behind the pop-up is blurred flat, so no features are expected there
- a band along the spine (where the paper curves) is left out

People look at a pop-up from the front and quite low, so every leaf gets a second,
"oblique" target: the leaf as a phone sees it from ~32° above the table. Detection
works within roughly ±20° of a target's own view, so the flat and oblique targets
together cover the whole range. Every target stores G, the homography from page
units to its own units; the app recovers the true page pose from it (js/tracking.js).

Writes targets/<id>.jpg, targets/targets.json + targets.js (every target with its G)
and assets/sceneN/ground.jpg (the page as printed, for Preview and the test pages).
"""
import json
import os

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, '..', 'Final Animations')
PAGE_W, PAGE_H = 3513, 2484
SPINE = 0.03          # leave out this much of the page width on each side of the spine
TARGET_W = 1000       # width of a target image in pixels

SCENES = {
    1: dict(
        ground='Scene 1/Ground/01_Ground_ARtargeted copy.jpg',
        # not printed: sunflower + label, umbrellas + upside-down label (snowman is printed)
        erase=[(3222, 720, 560, 620), (2255, 281, 700, 560)],
        # the classroom floor between the walls (desks and backpacks stand on it)
        popup=[(0.34, 0.2), (0.66, 0.2), (0.86, 0.77), (0.14, 0.77)],
    ),
    7: dict(
        ground='Scene 7/Ground/07_Ground.png',
        erase=[],
        popup=[(0.0, 0.0), (1.0, 0.0), (1.0, 0.27), (0.9, 0.27), (0.9, 0.43), (0.54, 0.43), (0.54, 0.27), (0.0, 0.27)],
        # the paper plane on its clear plastic strip
        extra=[[(0.15, 0.44), (0.32, 0.44), (0.32, 0.59), (0.15, 0.59)]],
    ),
    8: dict(
        ground='Scene 8/Ground/Targeted copy.jpg',
        erase=[(2849, 1459, 820, 600)],       # the seed hole with "Scan Here" is not printed
        popup=[(0.06, 0.0), (0.94, 0.0), (0.94, 0.28), (0.5, 0.48), (0.06, 0.28)],
    ),
    9: dict(
        ground='Scene 9/Ground/09_Ground copy.jpg',
        erase=[(2940, 1242, 560, 520)],       # the flower bush with "Scan Here" is not printed
        popup=[(0.16, 0.0), (0.86, 0.0), (0.86, 0.35), (0.5, 0.57), (0.16, 0.36)],
    ),
}


def erase_boxes(img, boxes):
    mask = np.zeros(img.shape[:2], np.uint8)
    for cx, cy, w, h in boxes:
        cv2.rectangle(mask, (int(cx - w / 2), int(cy - h / 2)), (int(cx + w / 2), int(cy + h / 2)), 255, -1)
    if not mask.any():
        return img
    small = cv2.resize(img, (PAGE_W // 4, PAGE_H // 4), interpolation=cv2.INTER_AREA)
    msmall = cv2.resize(mask, (PAGE_W // 4, PAGE_H // 4), interpolation=cv2.INTER_NEAREST)
    fill = cv2.inpaint(small, msmall, 12, cv2.INPAINT_TELEA)
    fill = cv2.resize(fill, (PAGE_W, PAGE_H), interpolation=cv2.INTER_CUBIC)
    # a little paper grain so the patch does not look plastic
    grain = np.random.default_rng(1).normal(0, 2.0, img.shape).astype(np.float32)
    fill = np.clip(fill.astype(np.float32) + grain, 0, 255).astype(np.uint8)
    soft = cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), 12)[..., None]
    return (img * (1 - soft) + fill * soft).astype(np.uint8)


def flatten_polys(img, polys):
    mask = np.zeros(img.shape[:2], np.uint8)
    for poly in polys:
        pts = np.int32([[x * PAGE_W, y * PAGE_H] for x, y in poly])
        cv2.fillPoly(mask, [pts], 255)
    flat = cv2.GaussianBlur(img, (0, 0), 45)
    soft = cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), 18)[..., None]
    return (img * (1 - soft) + flat * soft).astype(np.uint8)


ASPECT = PAGE_H / PAGE_W
# the extra views of every leaf: (name suffix, elevation °, camera distance in page widths)
# (synthetic low views were tried and never won on the real photos, where the photo
#  targets do much better, so none are built; e.g. [('o', 40.0, 1.05), ('p', 25.0, 1.0)])
OBLIQUE = []
FOV = 64.0


def page_to_px():
    """page units (x right, y up, spread centre = 0) -> artwork pixels"""
    return np.array([[PAGE_W, 0, PAGE_W / 2], [0, -PAGE_W, PAGE_H / 2], [0, 0, 1]], float)


def px_to_units(w, h):
    """target pixels -> target units (MindAR anchor space: 1 unit wide, centred, y up)"""
    return np.array([[1 / w, 0, -0.5], [0, -1 / w, h / (2 * w)], [0, 0, 1]], float)


def camera_homography(elev, dist, fov, size):
    """page units -> pixels of a camera in front of the book looking at the spread centre"""
    W, H = size
    e = np.radians(elev)
    cam = np.array([0, -np.cos(e) * dist, np.sin(e) * dist])
    fwd = -cam / np.linalg.norm(cam)
    right = np.cross(fwd, [0, 0, 1.0]); right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    f = (W / 2) / np.tan(np.radians(fov / 2))
    K = np.array([[f, 0, W / 2], [0, -f, H / 2], [0, 0, 1]])
    R = np.stack([right, up, fwd])                 # world -> camera (x right, y up, z forward)
    t = -R @ cam
    # a point (x, y, 0) on the page: X_cam = R[:, :2] (x, y) + t
    P = np.column_stack([R[:, 0], R[:, 1], t])
    return K @ P


def fill_outside(img, mask):
    """replace everything outside the mask with a blur of the page (no artificial edges)"""
    small = cv2.resize(img, (img.shape[1] // 8, img.shape[0] // 8), interpolation=cv2.INTER_AREA)
    msmall = cv2.resize((mask == 0).astype(np.uint8) * 255, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_NEAREST)
    small = cv2.inpaint(small, msmall, 6, cv2.INPAINT_TELEA)
    bg = cv2.GaussianBlur(cv2.resize(small, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_CUBIC), (0, 0), 8)
    soft = cv2.GaussianBlur((mask > 0).astype(np.float32), (0, 0), 3)[..., None]
    return (img * soft + bg * (1 - soft)).astype(np.uint8)


def save_target(img, tid, sid, kind, leaf, G, targets):
    Image.fromarray(img).save(os.path.join(ROOT, 'targets', tid + '.jpg'), quality=92)
    targets.append({
        'id': tid, 'scene': sid, 'kind': kind, 'leaf': leaf,
        'img': f'targets/{tid}.jpg',
        'G': [[round(float(v), 9) for v in row] for row in G],
    })
    print(tid, img.shape[1], 'x', img.shape[0])


def main():
    os.makedirs(os.path.join(ROOT, 'targets'), exist_ok=True)
    targets = []
    P2px = page_to_px()
    for sid, cfg in SCENES.items():
        page = np.asarray(Image.open(os.path.join(SRC, cfg['ground'])).convert('RGB').resize((PAGE_W, PAGE_H), Image.LANCZOS))
        printed = erase_boxes(page, cfg['erase'])
        # the page as printed (Preview stage + test pages)
        Image.fromarray(printed).resize((2048, round(2048 * PAGE_H / PAGE_W)), Image.LANCZOS).save(
            os.path.join(ROOT, 'assets', f'scene{sid}', 'ground.jpg'), quality=86)
        tgt = flatten_polys(printed, [cfg['popup']] + cfg.get('extra', []))

        for leaf, (x0, x1) in (('L', (0.0, 0.5 - SPINE)), ('R', (0.5 + SPINE, 1.0))):
            # --- flat: the leaf seen from straight above
            a, b = round(x0 * PAGE_W), round(x1 * PAGE_W)
            crop = tgt[:, a:b]
            h = round(TARGET_W * crop.shape[0] / crop.shape[1])
            img = np.asarray(Image.fromarray(crop).resize((TARGET_W, h), Image.LANCZOS))
            s = TARGET_W / (b - a)
            px2t = np.array([[s, 0, -a * s], [0, s, 0], [0, 0, 1]])
            G = px_to_units(TARGET_W, h) @ px2t @ P2px
            save_target(img, f's{sid}_{leaf}', sid, 'flat', leaf, G, targets)

            # --- oblique: the leaf as seen from the front of the book, low over the table
            for suffix, elev, dist in OBLIQUE:
                oblique_target(tgt, sid, leaf, a, b, suffix, elev, dist, P2px, targets)
    json.dump(targets, open(os.path.join(ROOT, 'targets', 'targets.json'), 'w'), indent=1)
    with open(os.path.join(ROOT, 'targets', 'targets.js'), 'w') as f:
        f.write('// generated by tools/targets/build_targets.py — the order matches the .mind files\n')
        f.write('export default ' + json.dumps(targets, indent=1) + ';\n')


def oblique_target(tgt, sid, leaf, a, b, suffix, elev, dist, P2px, targets):
    if True:
        if True:
            size = (2400, 1800)
            M = camera_homography(elev, dist, FOV, size) @ np.linalg.inv(P2px)
            view = cv2.warpPerspective(tgt, M, size, flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
            # the leaf's outline in the view
            quad_px = np.float32([[a, 0], [b, 0], [b, PAGE_H], [a, PAGE_H]]).reshape(-1, 1, 2)
            quad = cv2.perspectiveTransform(quad_px, M).reshape(-1, 2)
            mask = np.zeros(view.shape[:2], np.uint8)
            cv2.fillPoly(mask, [np.int32(quad)], 255)
            view = fill_outside(view, mask)
            x_0, y_0 = np.floor(quad.min(0)).astype(int) - 8
            x_1, y_1 = np.ceil(quad.max(0)).astype(int) + 8
            x_0, y_0 = max(0, x_0), max(0, y_0)
            x_1, y_1 = min(size[0], x_1), min(size[1], y_1)
            crop = view[y_0:y_1, x_0:x_1]
            s = TARGET_W / crop.shape[1]
            h = round(crop.shape[0] * s)
            img = np.asarray(Image.fromarray(crop).resize((TARGET_W, h), Image.LANCZOS))
            px2t = np.array([[s, 0, -x_0 * s], [0, s, -y_0 * s], [0, 0, 1]])
            G = px_to_units(TARGET_W, h) @ px2t @ M @ P2px
            save_target(img, f's{sid}_{leaf}{suffix}', sid, f'oblique{int(elev)}', leaf, G, targets)


if __name__ == '__main__':
    main()
