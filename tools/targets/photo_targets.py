"""Tracking targets made from Farnaz's photos of the printed pop-up book.

    python3 tools/targets/photo_targets.py        (after register.py has run for every scene)

At the angles people really hold a phone over a pop-up (20-50° above the table), the
most detailed and most camera-facing thing in view is the pop-up itself: walls, bed,
bushes, the girl. MindAR's detector also only looks at a 256 px window of a 640x480
frame at a time, so it needs that kind of dense, frontal detail. A photo of the open
book, taken from a typical viewpoint, is exactly that.

For every chosen photo the page homography is known (register.py), so each target
carries G = page units -> target units and the app recovers the page pose from
whichever target MindAR tracks (js/tracking.js). Near the photo's own viewpoint the
pop-up and the page move together, so the pose is right; further away another target
(or the flat page targets) takes over.

Appends the photo targets to targets/targets.json / targets.js.
"""
import json
import os

import cv2
import numpy as np
from PIL import Image, ImageOps

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PHOTOS = os.path.join(ROOT, '..', 'newtargetpoints', 'extracted')
RECT = os.path.join(ROOT, '..', 'newtargetpoints', 'rectified')
PAGE_W, PAGE_H = 3513, 2484           # artwork pixels
REG_W, REG_H = 1756, 1242             # page space used by register.py
PHOTO_W = 2000                        # photo width used by register.py
TARGET_W = 900

# chosen views per scene: [folder, photo, crop height above the page's far edge (fraction of page width in the photo)]
VIEWS = {   # well-registered photos, spread over the angles people use (elevation in comments)
    1: ('Target01', ['SC01 (14)', 'SC01 (1)', 'SC01 (3)', 'SC01 (2)', 'SC01 (7)']),        # 31°, 42°, 50°, 45°, right side
    7: ('Targetpoints07', ['Sc07 (10)', 'Sc07 (6)', 'Sc07 (3)', 'Sc07 (11)', 'Sc07 (4)', 'Sc07 (5)']),  # 23°-44°
    8: ('Targetpoints08', ['SC08 (2)', 'SC08 (1)', 'SC08 (4)']),                          # 34°, 41°, 53°
    9: ('Targetpoints09', ['Sc09 (4)', 'Sc09 (2)']),                                      # 48°, 56°
}


def page_homography(scene, name):
    """one homography page(REG px) -> photo px, fitted to both leaves"""
    src, dst = [], []
    report = json.load(open(os.path.join(RECT, f'scene{scene}', 'report.json')))[name]
    for leaf, x0, x1 in (('L', 0.05, 0.45), ('R', 0.55, 0.95)):
        f = os.path.join(RECT, f'scene{scene}', f'{name}_{leaf}_H.npy')
        if not os.path.exists(f) or report.get(leaf, 0) < 100:      # only leaves that registered well
            continue
        Hinv = np.linalg.inv(np.load(f))                     # page -> photo
        xs, ys = np.meshgrid(np.linspace(x0 * REG_W, x1 * REG_W, 12), np.linspace(0.05 * REG_H, 0.95 * REG_H, 12))
        pts = np.float32(np.stack([xs.ravel(), ys.ravel()], 1)).reshape(-1, 1, 2)
        src.append(pts.reshape(-1, 2))
        dst.append(cv2.perspectiveTransform(pts, Hinv).reshape(-1, 2))
    src, dst = np.concatenate(src), np.concatenate(dst)
    H, _ = cv2.findHomography(src, dst, 0)
    return H


def main():
    tpath = os.path.join(ROOT, 'targets', 'targets.json')
    targets = [t for t in json.load(open(tpath)) if t.get('kind') != 'photo']
    # page units -> REG pixels
    U2R = np.array([[REG_W, 0, REG_W / 2], [0, -REG_W, REG_H / 2], [0, 0, 1]], float)
    for scene, (folder, names) in VIEWS.items():
        for k, name in enumerate(names):
            key = name.replace(' ', '')
            im = ImageOps.exif_transpose(Image.open(os.path.join(PHOTOS, folder, name + '.jpg'))).convert('RGB')
            im = np.asarray(im.resize((PHOTO_W, round(im.height * PHOTO_W / im.width)), Image.LANCZOS))
            H = page_homography(scene, key)
            # the page outline in the photo; the crop keeps the page and the pop-up above it
            quad = cv2.perspectiveTransform(np.float32([[0, 0], [REG_W, 0], [REG_W, REG_H], [0, REG_H]]).reshape(-1, 1, 2), H).reshape(-1, 2)
            x0, x1 = quad[:, 0].min(), quad[:, 0].max()
            y_far, y_near = quad[:2, 1].min(), quad[2:, 1].max()
            popup = 0.55 * (x1 - x0)                          # the pop-up rises this far above the far edge
            X0, X1 = int(max(0, x0)), int(min(im.shape[1], x1))
            Y0, Y1 = int(max(0, y_far - popup)), int(min(im.shape[0], y_near))
            crop = im[Y0:Y1, X0:X1]
            s = TARGET_W / crop.shape[1]
            h = round(crop.shape[0] * s)
            img = np.asarray(Image.fromarray(crop).resize((TARGET_W, h), Image.LANCZOS))
            tid = f's{scene}_v{k + 1}'
            Image.fromarray(img).save(os.path.join(ROOT, 'targets', tid + '.jpg'), quality=92)
            # page units -> photo px -> crop px -> target units
            crop_px = np.array([[s, 0, -X0 * s], [0, s, -Y0 * s], [0, 0, 1]])
            units = np.array([[1 / TARGET_W, 0, -0.5], [0, -1 / TARGET_W, h / (2 * TARGET_W)], [0, 0, 1]])
            G = units @ crop_px @ H @ U2R
            G = G / G[2, 2]
            targets.append({'id': tid, 'scene': scene, 'kind': 'photo', 'leaf': 'C', 'img': f'targets/{tid}.jpg', 'from': name,
                            'G': [[round(float(v), 9) for v in row] for row in G]})
            print(tid, name, img.shape[1], 'x', img.shape[0])
    targets.sort(key=lambda t: (t['scene'], {'photo': 0, 'flat': 1}.get(t['kind'], 2), t['id']))
    json.dump(targets, open(tpath, 'w'), indent=1)
    with open(os.path.join(ROOT, 'targets', 'targets.js'), 'w') as f:
        f.write('// generated by tools/targets/build_targets.py + photo_targets.py — the order matches the .mind files\n')
        f.write('export default ' + json.dumps(targets, indent=1) + ';\n')


if __name__ == '__main__':
    main()
