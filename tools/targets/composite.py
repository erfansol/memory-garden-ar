"""Combines the registered photos of one scene into a single "as printed" page.

    python3 tools/targets/composite.py <rectified dir>/sceneN [min inliers]

Per leaf, every photo with enough inliers is brightness-normalised and the per-pixel
median is taken, so pop-up pieces and glare that cover the page in one photo are
replaced by the page as seen in the others. Writes print_L.jpg, print_R.jpg,
print.jpg (both leaves side by side) and coverage.png (how many photos saw each pixel).
"""
import glob
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image


def main():
    d = sys.argv[1]
    min_inl = int(sys.argv[2]) if len(sys.argv) > 2 else 120
    report = json.load(open(os.path.join(d, 'report.json')))
    leaves = {}
    for leaf in ('L', 'R'):
        stack, masks = [], []
        for name, r in report.items():
            if r.get(leaf, 0) < min_inl:
                continue
            im = np.asarray(Image.open(os.path.join(d, f'{name}_{leaf}.jpg'))).astype(np.float32)
            v = np.asarray(Image.open(os.path.join(d, f'{name}_{leaf}_valid.png'))) > 128
            v = cv2.erode(v.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
            # flatten uneven lighting: divide by a heavily blurred copy, then restore a common level
            lum = cv2.GaussianBlur(im.mean(2), (0, 0), 60)
            im = im / np.maximum(lum, 1)[..., None] * 200.0
            stack.append(np.where(v[..., None], im, np.nan))
            masks.append(v)
        if not stack:
            print(leaf, 'no photo good enough'); continue
        med = np.nanmedian(np.stack(stack), axis=0)
        cover = np.sum(masks, axis=0)
        med = np.nan_to_num(med, nan=200.0)
        leaves[leaf] = (np.clip(med, 0, 255).astype(np.uint8), cover)
        print(leaf, 'photos:', len(stack))
    H, W = next(iter(leaves.values()))[0].shape[:2]
    full = np.zeros((H, W, 3), np.uint8)
    cov = np.zeros((H, W), np.uint8)
    for leaf, (img, c) in leaves.items():
        half = slice(0, W // 2) if leaf == 'L' else slice(W // 2, W)
        full[:, half] = img[:, half]
        cov[:, half] = np.clip(c[:, half] * 40, 0, 255)
        Image.fromarray(img).save(os.path.join(d, f'print_{leaf}.jpg'), quality=94)
    Image.fromarray(full).save(os.path.join(d, 'print.jpg'), quality=94)
    Image.fromarray(cov).save(os.path.join(d, 'coverage.png'))


if __name__ == '__main__':
    main()
