"""Builds the transparent AR videos from the raw animations in "Final Animations".

    python3 tools/video/build_videos.py            # build everything
    python3 tools/video/build_videos.py s7_girl    # build one clip
    python3 tools/video/build_videos.py --preview  # key a few frames per clip -> tools/video/preview/

Output: assets/video/<name>.mp4 (+ assets/video/clips.json with the layout of every clip)
Requires: ffmpeg, python3 with numpy + opencv-python-headless.
"""
import json
import os
import sys

import cv2
import numpy as np

import matte as M

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.environ.get('MG_SOURCE', os.path.join(ROOT, '..', 'Final Animations'))
OUT = os.path.join(ROOT, 'assets', 'video')
PREVIEW = os.path.join(ROOT, 'tools', 'video', 'preview')

S1, S7, S8, S9 = 'Scene 1/Videos/', 'Scene 7/Videos/', 'Scene 8/Video/', 'Scene 9/Videos/'

# height = output height of the colour half (px); xfade = seconds of loop cross-fade
CLIPS = {
    's1_spring': dict(src=S1 + 'Sc01_Spring.mp4', method='chroma', key='green', height=600, xfade=0.8),
    's1_autumn': dict(src=S1 + 'Sc01_autumn2.mp4', src2=S1 + 'Sc01_autumn3.mp4', method='diff2',
                      work=(768, 864), height=820, xfade=0.8),
    's1_winter': dict(src=S1 + 'Sc01_winter.mp4', method='none', height=960, xfade=0.8),
    's7_window': dict(src=S7 + 'flova_Standalone_window_open_close_animation_v2_video_202609191507_0e2a43.mp4',
                      method='chroma', key='green', height=520, hold=True),
    's7_girl': dict(src=S7 + 'Sc07.mp4', method='chroma', key='magenta', height=1000,
                    fill=2500, loop_search=(4.2, 10.0), loop_min=3.0, xfade=0.6),
    's8_girl': dict(src=S8 + 'Sc08_3.mp4',
                    src2=S8 + 'flova_Standalone_sc08_sprite_animation_video_202609102141_0873ec.mp4',
                    method='dual', work=(834, 1112), height=900, fill=3000, audio=True),
    's9_girl': dict(src=S9 + 'Sc09_Girl.mp4', method='light', height=780, fill=6000, ml=True, xfade=1.0),
    's9_bush': dict(src=S9 + 'Sc09_bush.mp4', method='light', height=560, fill=60, xfade=1.0),
}

# Growing-plant animations become sprite atlases (no video decoder needed per plant)
ATLASES = {
    's9_daisy': dict(src=S9 + 'flova_Standalone_growing_plant_animation_v3_video_202609191614_dbdc51.mp4',
                     key='magenta', frames=36, cell_h=384),
    's9_lavender': dict(src=S9 + 'flova_Standalone_growing_plant_animation_video_202609191557_0fd79a.mp4',
                        key='magenta', frames=36, cell_h=384),
}


# --------------------------------------------------------------------------
def border_bg(rgb):
    f = rgb.astype(np.float32)
    b = np.concatenate([f[:6].reshape(-1, 3), f[-6:].reshape(-1, 3),
                        f[:, :6].reshape(-1, 3), f[:, -6:].reshape(-1, 3)])
    return np.median(b, 0)


class Keyer:
    """Turns one source frame (or a pair) into straight-alpha RGBA float32 0..1."""

    def __init__(self, cfg, first, first2=None):
        self.cfg = cfg
        self.method = cfg['method']
        self.seg = None
        if self.method == 'chroma':
            self.bg = border_bg(first)
        elif self.method == 'light':
            self.bgmodel = M.fit_bg_model(first)
            if cfg.get('ml'):
                from rembg import new_session
                self.seg = new_session('isnet-anime', providers=['CPUExecutionProvider'])
        elif self.method == 'diff2':
            self.bgA = border_bg(first)       # darker flat grey
            self.bgB = border_bg(first2)      # white
        self.frame = 0
        self.ml_mask = None

    def ml(self, rgb):
        """Character mask from the isnet-anime model (refreshed every few frames)."""
        from PIL import Image
        from rembg import remove
        if self.ml_mask is None or self.frame % self.cfg.get('ml_every', 1) == 0:
            m = remove(Image.fromarray(rgb), session=self.seg, only_mask=True)
            self.ml_mask = np.asarray(m, np.float32) / 255.0
        return self.ml_mask

    def __call__(self, rgb, rgb2=None):
        cfg, m = self.cfg, self.method
        f = rgb.astype(np.float32)
        self.frame += 1
        if m == 'none':
            return np.dstack([f / 255.0, np.ones(f.shape[:2], np.float32)])

        if m == 'chroma':
            a0, k, k_bg = M.chroma_alpha(rgb, cfg['key'], self.bg)
            a, col = M.refine(rgb, a0)
            # enclosed pockets are kept unless they are pure screen colour
            lab, cand = M.enclosed_components(a, cfg.get('fill', 1500))
            # a pocket that is mostly pure screen colour is a real hole, not a green/pink detail
            pure = M.component_mean((k > 0.85 * k_bg).astype(np.float32), lab, len(cand))
            a, filled = M.fill_components(a, lab, cand & (pure < 0.2))
            col = np.where(filled[..., None], f, col)
            a = M.clean_alpha(a)
            col = M.despill(col, cfg['key'], M.edge_band(a, 4) * (~filled))
        elif m == 'light':
            # per-frame background model (AI videos flicker), corrected by the nearby paper colour
            model = M.fit_bg_model(rgb)
            d0 = np.sqrt(((f - model) ** 2).sum(2))
            lab0, cand0 = M.enclosed_components((d0 >= 16).astype(np.float32), 10 ** 9)
            outer = (d0 < 16) & ~cand0[lab0]
            bgf = M.pushpull(f, M.erode(outer, 2).astype(np.float32))
            a0 = M.light_alpha(rgb, bgf, cfg.get('lo', 8.0), cfg.get('hi', 26.0))
            a, col = M.refine(rgb, a0, bg_field=bgf)
            lab, cand = M.enclosed_components(a, cfg.get('fill', 800))
            if self.seg is not None:
                mm = M.component_mean(self.ml(rgb), lab, len(cand))
                keep = cand & (mm > 0.5)
            else:
                keep = cand
            a, filled = M.fill_components(a, lab, keep)
            col = np.where(filled[..., None], f, col)
            a = M.clean_alpha(a)
        elif m == 'diff2':
            g2 = rgb2.astype(np.float32)
            d = (g2 - f).mean(2)
            span = float((self.bgB - self.bgA).mean())
            a = np.clip(1.0 - d / span, 0, 1)
            a = M.clean_alpha(a, 0.04, 0.96)
            a3 = np.clip(a, 0.1, 1)[..., None]
            col = np.clip((f - (1 - a3) * self.bgA) / a3, 0, 255)
        elif m == 'dual':
            # rgb = over white (hi-res, the colour source), rgb2 = over black (resized):
            # anything visible over black is definitely part of the character
            bk = rgb2.astype(np.float32)
            white = np.full_like(f, 255.0)
            a0 = M.light_alpha(rgb, white, 10.0, 30.0)
            core = M.erode(bk.max(2) > 45, 3)
            a0 = np.maximum(a0, core.astype(np.float32))
            a, col = M.refine(rgb, a0, bg_field=white)
            lab, cand = M.enclosed_components(a, cfg.get('fill', 3000))
            mk = M.component_mean(core.astype(np.float32), lab, len(cand))
            a, filled = M.fill_components(a, lab, cand & (mk > 0.3))
            col = np.where(filled[..., None], f, col)
            a = M.clean_alpha(a)
        col = M.bleed(col, a)
        return np.dstack([col / 255.0, a]).astype(np.float32)


def frames_of(cfg, work=None):
    a = M.read_frames(os.path.join(SRC, cfg['src']), work)
    if 'src2' not in cfg:
        return ((x, None) for x in a)
    info = M.probe(os.path.join(SRC, cfg['src']))
    size = work or (info['w'], info['h'])
    b = M.read_frames(os.path.join(SRC, cfg['src2']), size)
    info2 = M.probe(os.path.join(SRC, cfg['src2']))
    if abs(info2['fps'] - info['fps']) < 0.01:
        return zip(a, b)
    return _retime_pairs(a, b, info['fps'], info2['fps'])


def _retime_pairs(a, b, fa, fb):
    """Pair each frame of stream a with the nearest-in-time frame of stream b."""
    bl, bi = None, -1
    for i, x in enumerate(a):
        want = round(i / fa * fb)
        while bi < want:
            nxt = next(b, None)
            if nxt is None:
                break
            bl, bi = nxt, bi + 1
        yield x, bl


def first_frames(cfg, work=None):
    return next(iter(frames_of(cfg, work)))


def compute_bbox(cfg, keyer, work, step=6):
    ys0, xs0, ys1, xs1 = 1e9, 1e9, -1, -1
    shape = None
    for i, (x, y) in enumerate(frames_of(cfg, work)):
        if i % step:
            continue
        rgba = keyer(x, y)
        shape = rgba.shape
        m = rgba[..., 3] > 0.02
        if not m.any():
            continue
        yy, xx = np.nonzero(m)
        ys0, xs0 = min(ys0, yy.min()), min(xs0, xx.min())
        ys1, xs1 = max(ys1, yy.max()), max(xs1, xx.max())
    h, w = shape[:2]
    pad = 10
    return (max(0, int(xs0) - pad), max(0, int(ys0) - pad),
            min(w, int(xs1) + pad + 1), min(h, int(ys1) + pad + 1))


def even(v):
    return int(round(v / 2.0)) * 2


# --------------------------------------------------------------------------
def build_clip(name, cfg):
    path = os.path.join(SRC, cfg['src'])
    info = M.probe(path)
    fps, n = info['fps'], info['n']
    work = cfg.get('work')
    x0, y0 = first_frames(cfg, work)
    keyer = Keyer(cfg, x0, y0)

    if cfg['method'] == 'none':
        bbox = (0, 0, work[0] if work else info['w'], work[1] if work else info['h'])
    else:
        bbox = compute_bbox(cfg, keyer, work)
    bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    scale = min(1.0, cfg['height'] / bh)
    ow, oh = even(bw * scale), even(bh * scale)
    layout = 'none' if cfg['method'] == 'none' else ('v' if ow > oh * 1.15 else 'h')

    # loop set-up
    K = int(round(cfg.get('xfade', 0) * fps))
    intro_end = None
    frames_needed = n
    if 'loop_search' in cfg:
        a_s, b_s = find_loop(cfg, keyer, work, bbox, fps)
        seg_a, seg_b = int(a_s * fps), int(b_s * fps)
        frames_needed = seg_b
        intro_end = seg_a
        print(f'  loop segment {a_s:.2f}s..{b_s:.2f}s')

    out_path = os.path.join(OUT, name + '.mp4')
    audio = None
    if cfg.get('audio'):
        audio = dict(src=path)
    loop_start = loop_end = None
    if K and intro_end is None:
        # whole clip loops: output = F[K..n-K-1] + blend(F[n-K+i], F[i])
        loop_start, loop_end = 0.0, (n - K) / fps
    elif K and intro_end is not None:
        loop_start = (intro_end + K) / fps
        loop_end = frames_needed / fps
    keyframes = [loop_start] if loop_start else None
    writer = M.PackedWriter(out_path, ow, oh, fps, layout, keyframes=keyframes,
                            audio=None if K else audio)

    def prep(x, y):
        rgba = keyer(x, y)[bbox[1]:bbox[3], bbox[0]:bbox[2]]
        if scale < 1:
            rgba = resize_rgba(rgba, ow, oh)
        elif rgba.shape[1] != ow or rgba.shape[0] != oh:
            rgba = resize_rgba(rgba, ow, oh)
        return rgba

    head = []
    tail_start = frames_needed - K
    for i, (x, y) in enumerate(frames_of(cfg, work)):
        if i >= frames_needed:
            break
        if K and intro_end is None and i < K:
            head.append(prep(x, y))
            continue
        if K and intro_end is not None and intro_end <= i < intro_end + K:
            fr = prep(x, y)
            head.append(fr)
            writer.write(fr)
            continue
        if K and i >= tail_start:
            j = i - tail_start
            w = (j + 1) / (K + 1)
            writer.write(mix_rgba(prep(x, y), head[j], w))
            continue
        writer.write(prep(x, y))
    writer.close()
    total = writer.count / fps
    meta = dict(file=f'assets/video/{name}.mp4', w=ow, h=oh, layout=layout, gap=M.PackedWriter.GAP,
                fps=fps, duration=round(total, 3), aspect=round(ow / oh, 5))
    if loop_start is not None:
        meta['loop'] = [round(loop_start, 3), round(loop_end, 3)]
    if cfg.get('hold'):
        meta['hold'] = True
    print(f'  -> {out_path}  {ow}x{oh} {layout}  {writer.count} frames  {os.path.getsize(out_path)/1e6:.1f} MB')
    if not cfg.get('audio'):
        meta['audio'] = extract_audio(name, path, total)
    return meta


def extract_audio(name, src, dur):
    """Soundtrack as a separate loopable file (played only when the viewer turns sound on)."""
    os.makedirs(os.path.join(ROOT, 'assets', 'audio'), exist_ok=True)
    dst = os.path.join(ROOT, 'assets', 'audio', name + '.m4a')
    fade = min(0.6, dur / 4)
    import subprocess
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vn', '-t', f'{dur:.3f}',
                    '-af', f'afade=t=in:d={fade},afade=t=out:st={dur - fade:.3f}:d={fade},loudnorm=I=-24:TP=-3',
                    '-c:a', 'aac', '-b:a', '80k', '-ac', '2', dst], check=True)
    return f'assets/audio/{name}.m4a'


def mix_rgba(a, b, w):
    """Cross-fade in premultiplied space (a -> b with weight w)."""
    pa = a[..., :3] * a[..., 3:]
    pb = b[..., :3] * b[..., 3:]
    al = a[..., 3:] * (1 - w) + b[..., 3:] * w
    pc = pa * (1 - w) + pb * w
    col = pc / np.maximum(al, 1e-4)
    col = np.where(al > 1e-3, col, a[..., :3] * (1 - w) + b[..., :3] * w)
    return np.dstack([np.clip(col, 0, 1), al]).astype(np.float32)


def resize_rgba(rgba, w, h):
    pre = rgba.copy()
    pre[..., :3] *= rgba[..., 3:]
    pre = cv2.resize(pre, (w, h), interpolation=cv2.INTER_AREA)
    a = pre[..., 3:]
    col = pre[..., :3] / np.maximum(a, 1e-4)
    col = M.bleed(np.clip(col * 255, 0, 255), a[..., 0]) / 255.0
    return np.dstack([np.clip(col, 0, 1), a]).astype(np.float32)


def find_loop(cfg, keyer, work, bbox, fps):
    """Find the two most similar frames (far enough apart) for a seamless hold loop."""
    t0, t1 = cfg['loop_search']
    small = []
    for i, (x, y) in enumerate(frames_of(cfg, work)):
        t = i / fps
        if t < t0:
            continue
        if t > t1:
            break
        rgba = keyer(x, y)[bbox[1]:bbox[3], bbox[0]:bbox[2]]
        s = cv2.resize(rgba, (64, int(64 * rgba.shape[0] / rgba.shape[1])), interpolation=cv2.INTER_AREA)
        s[..., :3] *= s[..., 3:]
        small.append((t, s))
    best = (1e9, None, None)
    for i in range(len(small)):
        for j in range(i + 1, len(small)):
            if small[j][0] - small[i][0] < cfg['loop_min']:
                continue
            d = float(np.abs(small[i][1] - small[j][1]).mean())
            if d < best[0]:
                best = (d, small[i][0], small[j][0])
    print(f'  best loop diff {best[0]:.4f}')
    return best[1], best[2]


# --------------------------------------------------------------------------
def build_atlas(name, cfg):
    path = os.path.join(SRC, cfg['src'])
    info = M.probe(path)
    first = next(M.read_frames(path))
    keyer = Keyer(dict(method='chroma', key=cfg['key'], fill=400), first)
    picks = set(np.linspace(0, info['n'] - 1, cfg['frames']).round().astype(int).tolist())
    frames = []
    for i, x in enumerate(M.read_frames(path)):
        if i in picks:
            frames.append(keyer(x))
    # union bbox
    m = np.zeros(frames[0].shape[:2], bool)
    for f in frames:
        m |= f[..., 3] > 0.02
    yy, xx = np.nonzero(m)
    x0, x1, y0, y1 = xx.min() - 6, xx.max() + 7, yy.min() - 6, yy.max() + 7
    x0, y0 = max(0, x0), max(0, y0)
    ch = cfg['cell_h']
    cw = even(ch * (x1 - x0) / (y1 - y0))
    cols = int(np.ceil(np.sqrt(len(frames) * ch / cw)))
    rows = int(np.ceil(len(frames) / cols))
    sheet = np.zeros((rows * ch, cols * cw, 4), np.float32)
    for k, f in enumerate(frames):
        cell = resize_rgba(f[y0:y1, x0:x1], cw, ch)
        r, c = divmod(k, cols)
        sheet[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] = cell
    out = (np.clip(sheet, 0, 1) * 255 + 0.5).astype(np.uint8)
    png = os.path.join(ROOT, 'assets', 'scene9', name.split('_', 1)[1] + '_grow.webp')
    from PIL import Image
    Image.fromarray(out, 'RGBA').save(png, 'WEBP', quality=86, method=6)
    print(f'  -> {png} {cols}x{rows} cells of {cw}x{ch}  {os.path.getsize(png)/1e6:.1f} MB')
    return dict(file=os.path.relpath(png, ROOT), cols=cols, rows=rows, frames=len(frames),
                cell=[cw, ch], aspect=round(cw / ch, 5), duration=round(info['n'] / info['fps'], 3))


# --------------------------------------------------------------------------
def preview(names):
    os.makedirs(PREVIEW, exist_ok=True)
    paper = np.array([236, 222, 196], np.float32) / 255
    for name in names:
        cfg = CLIPS[name]
        info = M.probe(os.path.join(SRC, cfg['src']))
        work = cfg.get('work')
        x0, y0 = first_frames(cfg, work)
        keyer = Keyer(cfg, x0, y0)
        picks = {int(info['n'] * p) for p in (0.1, 0.45, 0.8)}
        tiles = []
        for i, (x, y) in enumerate(frames_of(cfg, work)):
            if i in picks:
                rgba = keyer(x, y)
                a = rgba[..., 3:]
                comp = rgba[..., :3] * a + paper * (1 - a)
                h, w = a.shape[:2]
                yy, xx = np.mgrid[0:h, 0:w]
                chk = np.where(((yy // 16 + xx // 16) % 2)[..., None] == 0, 0.35, 0.55).astype(np.float32)
                comp2 = rgba[..., :3] * a + chk * (1 - a)
                tiles.append(np.concatenate([comp, comp2], 1))
        img = np.concatenate(tiles, 0)
        s = 1400 / img.shape[1]
        img = cv2.resize(img, (int(img.shape[1] * s), int(img.shape[0] * s)), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(PREVIEW, name + '.jpg'),
                    cv2.cvtColor((img * 255).astype(np.uint8), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 88])
        print('preview', name)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--preview' in sys.argv:
        preview(args or list(CLIPS))
        return
    os.makedirs(OUT, exist_ok=True)
    manifest_path = os.path.join(OUT, 'clips.json')
    for name in (args or list(CLIPS) + list(ATLASES)):
        print(name, flush=True)
        meta = build_clip(name, CLIPS[name]) if name in CLIPS else build_atlas(name, ATLASES[name])
        # re-read so parallel edits to the manifest are never lost
        manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
        manifest[name] = meta
        json.dump(manifest, open(manifest_path, 'w'), indent=1)
    if not args or 's8_girl' in args:
        import extract_planted
        extract_planted.main()
    print('manifest ->', manifest_path)


if __name__ == '__main__':
    main()
