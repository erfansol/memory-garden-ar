"""Scene 1: cuts the classroom wall out of Farnaz's print sheet (01_Assets1.png).

    python3 tools/prepare_wall.py

Everything outside the wall's outline (white paper, fold marks, glue tabs) becomes
transparent. The result is one strip; js/scenes/scene1.js folds it along the two fold
lines into a left wall, a centre wall and a right wall.
"""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, '..', 'Farnaz_Memory_Garden', 'Scene1', '01_Assets1.png')

X0, X1 = 15, 827          # outer edges of the wall
TOP, BOTTOM = 208, 505    # flat top of the centre wall / bottom of the baseboard
FOLD_L, FOLD_R = 283, 560 # fold lines (the flat top runs between them)
SIDE_TOP = 332            # height of the outer edges of the side walls
SCALE = 2                 # upscale for a smoother edge

im = Image.open(SRC).convert('RGBA').crop((X0, TOP, X1 + 1, BOTTOM + 1))
w, h = im.size
im = im.resize((w * SCALE, h * SCALE), Image.LANCZOS)
a = np.asarray(im).copy()
Y, X = np.mgrid[0:h * SCALE, 0:w * SCALE] / SCALE
X = X + X0
Y = Y + TOP
top = np.where(X < FOLD_L, SIDE_TOP + (TOP - SIDE_TOP) * (X - X0) / (FOLD_L - X0),
               np.where(X > FOLD_R, TOP + (SIDE_TOP - TOP) * (X - FOLD_R) / (X1 - FOLD_R), TOP))
inside = np.clip((Y - top - 1.2) * SCALE, 0, 1)            # just below the printed outline
inside *= np.clip((X - X0 - 1.0) * SCALE, 0, 1) * np.clip((X1 - X - 1.0) * SCALE, 0, 1)
a[..., 3] = (a[..., 3] * inside).astype(np.uint8)
dst = os.path.join(ROOT, 'assets', 'scene1', 'wall_in.png')
Image.fromarray(a).save(dst, optimize=True)

# geometry for the scene, in page units (the print sheet has the same scale as the page)
page_w = 843.0
geo = {
    'u': [0, (FOLD_L - X0) / (X1 - X0), (FOLD_R - X0) / (X1 - X0), 1],
    'widths': [(FOLD_L - X0) / page_w, (FOLD_R - FOLD_L) / page_w, (X1 - FOLD_R) / page_w],
    'height': (BOTTOM - TOP) / page_w,
    'sideHeight': (BOTTOM - SIDE_TOP) / page_w,
}
print(dst, im.size, json.dumps({k: [round(x, 4) for x in v] if isinstance(v, list) else round(v, 4) for k, v in geo.items()}))
