"""Scene 8: cuts the planted soil mound + sprout out of the last frame of s8_girl.mp4.
The girl leaves it behind at each planting spot (assets/scene8/planted.png).

    python3 tools/video/extract_planted.py
"""
import json
import os
import subprocess

import cv2
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TOP, MOUND, SAND = 630, 699, 668   # rows (of 900): sprout top, mound top, start of loose sand


def main():
    meta = json.load(open(os.path.join(ROOT, 'assets', 'video', 'clips.json')))['s8_girl']
    w, h, gap = meta['w'], meta['h'], meta['gap']
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-sseof', '-0.1', '-i', os.path.join(ROOT, meta['file']),
                          '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
    f = np.frombuffer(raw, np.uint8).reshape(h, w * 2 + gap, 3)
    col, a = f[:, :w].copy(), f[:, w + gap:, 0].copy()
    c = col.astype(int)
    # the sprout's olive leaves (her white shoes stand right next to them)
    leaf = (c[..., 1] >= c[..., 0] - 14) & (c[..., 1] > c[..., 2] + 38)
    n, lab, st, _ = cv2.connectedComponentsWithStats(leaf[TOP:MOUND].astype(np.uint8), connectivity=8)
    big = np.zeros(n, bool)
    big[1:] = st[1:, cv2.CC_STAT_AREA] > 30
    m = np.zeros_like(leaf)
    m[TOP:MOUND] = big[lab]
    sand = (c[..., 0] - c[..., 2] > 45) & (c[..., 0] > 110) & (c[..., 0] < 235)
    m[SAND:MOUND] |= sand[SAND:MOUND]
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
    keep = np.zeros_like(a)
    keep[MOUND:] = a[MOUND:]
    keep[TOP:MOUND] = np.where(m[TOP:MOUND], a[TOP:MOUND], 0)
    keep = cv2.GaussianBlur(keep, (3, 3), 0)
    rgba = np.dstack([col, keep])[TOP:]
    dst = os.path.join(ROOT, 'assets', 'scene8', 'planted.png')
    cv2.imwrite(dst, cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA), [cv2.IMWRITE_PNG_COMPRESSION, 9])
    print('  ->', dst, rgba.shape)


if __name__ == '__main__':
    main()
