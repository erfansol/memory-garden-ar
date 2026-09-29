"""Registers photos of the printed book onto the page layout.

For every photo, features are matched against the digital ground page, and a
homography is estimated separately for the left and the right leaf (a pop-up book
lies open in a slight V, so the two leaves are not one plane).

    python3 tools/targets/register.py <photos dir> <scene id> [out dir]

Writes <out>/sceneN/<photo>_L.jpg / _R.jpg: each leaf warped to page space
(half the resolution of the 3513 x 2484 artwork), plus a validity mask, and prints
the inlier counts so bad photos can be skipped.
"""
import glob
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageOps

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, '..', 'Final Animations')
GROUNDS = {
    '1': 'Scene 1/Ground/01_Ground_ARtargeted copy.jpg',
    '7': 'Scene 7/Ground/07_Ground.png',
    '8': 'Scene 8/Ground/Targeted copy.jpg',
    '9': 'Scene 9/Ground/09_Ground copy.jpg',
}
PAGE_W, PAGE_H = 1756, 1242          # page space used here (= artwork / 2)
PHOTO_W = 2000


def load_photo(path):
    im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    s = PHOTO_W / im.width
    im = im.resize((PHOTO_W, round(im.height * s)), Image.LANCZOS)
    return np.asarray(im)


def sift_match(sift, img_a, img_b, ratio=0.75, mask_b=None):
    ka, da = sift.detectAndCompute(img_a, None)
    kb, db = sift.detectAndCompute(img_b, mask_b)
    if da is None or db is None or len(kb) < 10:
        return np.zeros((0, 2), np.float32), np.zeros((0, 2), np.float32)
    m = cv2.BFMatcher().knnMatch(da, db, k=2)
    good = [x for x, y in (p for p in m if len(p) == 2) if x.distance < ratio * y.distance]
    return (np.float32([ka[x.queryIdx].pt for x in good]), np.float32([kb[x.trainIdx].pt for x in good]))


def homography(src, dst, thresh):
    if len(src) < 12:
        return None, 0
    H, inl = cv2.findHomography(src, dst, cv2.USAC_MAGSAC, thresh, maxIters=20000, confidence=0.999)
    return (H, int(inl.sum())) if H is not None else (None, 0)


def register_leaf(sift, photo_g, ground_g, leaf):
    """photo -> page homography for one leaf: coarse (simulated oblique views), then refined
    twice on the rectified photo (which by then is almost a flat view of the page)."""
    x0, x1 = (0, PAGE_W // 2) if leaf == 'L' else (PAGE_W // 2, PAGE_W)
    mask = np.zeros_like(ground_g)
    mask[:, x0:x1] = 255
    best = (None, 0)
    for squash in (1.0, 0.7, 0.5, 0.38):
        # the page seen from the front at an angle: shorter, and narrower at the far edge
        top = 0.5 * (1 - squash) * 0.35
        S = cv2.getPerspectiveTransform(
            np.float32([[0, 0], [PAGE_W, 0], [PAGE_W, PAGE_H], [0, PAGE_H]]),
            np.float32([[PAGE_W * top, 0], [PAGE_W * (1 - top), 0], [PAGE_W, PAGE_H * squash], [0, PAGE_H * squash]]))
        size = (PAGE_W, int(PAGE_H * squash))
        sim = cv2.warpPerspective(ground_g, S, size, flags=cv2.INTER_AREA)
        simmask = cv2.warpPerspective(mask, S, size, flags=cv2.INTER_NEAREST)
        a, b = sift_match(sift, photo_g, sim, 0.75, simmask)
        H, n = homography(a, b, 4.0)
        if H is not None and n > best[1]:
            best = (np.linalg.inv(S) @ H, n)
    H = best[0]
    if H is None or best[1] < 12:
        return None, best[1]
    n = best[1]
    for _ in range(2):
        flat = cv2.warpPerspective(photo_g, H, (PAGE_W, PAGE_H), flags=cv2.INTER_AREA)
        a, b = sift_match(sift, flat, ground_g, 0.78, mask)
        C, n2 = homography(a, b, 3.0)
        if C is None or n2 < 20:
            break
        H, n = C @ H, n2
    return H / H[2, 2], n


def main():
    photos, scene = sys.argv[1], sys.argv[2]
    out = os.path.join(sys.argv[3] if len(sys.argv) > 3 else os.path.join(photos, '..', 'rectified'), 'scene' + scene)
    os.makedirs(out, exist_ok=True)
    ground = Image.open(os.path.join(SRC, GROUNDS[scene])).convert('RGB').resize((PAGE_W, PAGE_H), Image.LANCZOS)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    g = clahe.apply(cv2.cvtColor(np.asarray(ground), cv2.COLOR_RGB2GRAY))
    sift = cv2.SIFT_create(15000)
    report = {}
    for path in sorted(glob.glob(os.path.join(photos, '*.jp*g'))):
        name = os.path.splitext(os.path.basename(path))[0].replace(' ', '')
        photo = load_photo(path)
        p = clahe.apply(cv2.cvtColor(photo, cv2.COLOR_RGB2GRAY))
        res = {}
        for leaf in ('L', 'R'):
            H, n = register_leaf(sift, p, g, leaf)
            res[leaf] = n
            if H is None:
                continue
            warped = cv2.warpPerspective(photo, H, (PAGE_W, PAGE_H), flags=cv2.INTER_LANCZOS4)
            valid = cv2.warpPerspective(np.full(photo.shape[:2], 255, np.uint8), H, (PAGE_W, PAGE_H), flags=cv2.INTER_NEAREST)
            Image.fromarray(warped).save(os.path.join(out, f'{name}_{leaf}.jpg'), quality=92)
            Image.fromarray(valid).save(os.path.join(out, f'{name}_{leaf}_valid.png'))
            np.save(os.path.join(out, f'{name}_{leaf}_H.npy'), H)
        report[name] = res
        print(name, res, flush=True)
    json.dump(report, open(os.path.join(out, 'report.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
