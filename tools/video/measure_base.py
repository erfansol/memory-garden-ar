"""Measures, over time, how high the lowest visible point of each transparent clip is
(for example Diana's crossed legs once she sits down), so the player can keep the
character standing on the paper instead of floating above it.

    python3 tools/video/measure_base.py          # all clips in assets/video/clips.json

Adds to every packed clip:  "base": {"dt": seconds per sample, "v": [fraction of the height, ...]}
"""
import json
import os

import numpy as np

import matte as M

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DT = 0.25          # sampling interval (s)
MIN_COVER = 0.02   # a row counts as "ground" when at least 2% of it is opaque


def lowest_rows(meta):
    path = os.path.join(ROOT, meta['file'])
    w, h, gap = meta['w'], meta['h'], meta['gap']
    step = max(1, round(DT * meta['fps']))
    out = []
    for i, f in enumerate(M.read_frames(path)):
        if i % step:
            continue
        a = f[:, w + gap:, 0] if meta['layout'] == 'h' else f[h + gap:, :, 0]
        cover = (a > 128).mean(1)
        rows = np.nonzero(cover > MIN_COVER)[0]
        out.append((h - 1 - rows.max()) / h if len(rows) else 0.0)
    return np.array(out)


def smooth(v, k=5):
    pad = np.pad(v, (k // 2, k // 2), mode='edge')
    med = np.array([np.median(pad[i:i + k]) for i in range(len(v))])
    return np.convolve(np.pad(med, (1, 1), mode='edge'), [0.25, 0.5, 0.25], mode='valid')


def main():
    p = os.path.join(ROOT, 'assets', 'video', 'clips.json')
    clips = json.load(open(p))
    for name, meta in clips.items():
        if meta.get('layout') not in ('h', 'v'):
            continue
        v = smooth(lowest_rows(meta))
        meta['base'] = {'dt': DT, 'v': [round(float(x), 4) for x in v]}
        print(f'{name}: lowest point {v.min():.3f}..{v.max():.3f} of the height')
    json.dump(clips, open(p, 'w'), indent=1)


if __name__ == '__main__':
    main()
