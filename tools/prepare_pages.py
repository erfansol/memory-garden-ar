"""Copies the book's page artwork into the web app.

    python3 tools/prepare_pages.py

- targets/<id>.jpg          the six "Scan Here" icons (tracked by MindAR)
- assets/sceneN/ground.jpg  the full ground pages (preview stage + printable test pages)
"""
import os

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.environ.get('MG_SOURCE', os.path.join(ROOT, '..', 'Final Animations'))

TARGETS = {
    's1_spring': 'Scene 1/Target images/Sc01_Spring.png',
    's1_autumn': 'Scene 1/Target images/Sc01_autumn.png',
    's1_winter': 'Scene 1/Target images/Sc01_winter.png',
    's7_bunny': 'Scene 7/Target image/Target Images copy.jpg',
    's8_hole': 'Scene 8/Target Image/08_Target Image.png',
    's9_flower': 'Scene 9/Target image/09_Target Image.png',
}
GROUNDS = {
    'scene1': 'Scene 1/Ground/01_Ground_ARtargeted copy.jpg',
    'scene7': 'Scene 7/Ground/07_Ground.png',
    'scene8': 'Scene 8/Ground/Targeted copy.jpg',
    'scene9': 'Scene 9/Ground/09_Ground copy.jpg',
}


def flat(im):
    im = im.convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    return Image.alpha_composite(bg, im).convert('RGB')


os.makedirs(os.path.join(ROOT, 'targets'), exist_ok=True)
for tid, rel in TARGETS.items():
    im = flat(Image.open(os.path.join(SRC, rel)))
    dst = os.path.join(ROOT, 'targets', tid + '.jpg')
    im.save(dst, quality=93)
    print('target', tid, im.size)

for scene, rel in GROUNDS.items():
    im = flat(Image.open(os.path.join(SRC, rel)))
    os.makedirs(os.path.join(ROOT, 'assets', scene), exist_ok=True)
    im.resize((2048, round(2048 * im.height / im.width)), Image.LANCZOS).save(
        os.path.join(ROOT, 'assets', scene, 'ground.jpg'), quality=86)
    print('ground', scene, im.size)
