"""Background removal for the Memory Garden animation videos.

Every source video is turned into a "packed alpha" MP4: the colour frame and a
greyscale alpha frame sit next to each other (or on top of each other) inside
one ordinary H.264 video. That plays everywhere (iPhone Safari included), and a
small shader in js/video.js puts the two halves back together as RGBA.

Keying methods (chosen per video in build_videos.py):
  chroma  - uniform green / magenta screen
  light   - off-white / light-grey paper background (smooth bg model)
  diff2   - the same animation rendered over two different flat greys (exact)
  dual    - the same animation over black and over white (approximately aligned)
  none    - no keying (the shader applies a soft vignette instead)
"""
import json
import subprocess

import cv2
import numpy as np


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# --------------------------------------------------------------------------
# video I/O
# --------------------------------------------------------------------------
def probe(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames',
         '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames',
         '-of', 'json', path],
        capture_output=True, text=True, check=True).stdout
    s = json.loads(out)['streams'][0]
    num, den = s['r_frame_rate'].split('/')
    return dict(w=int(s['width']), h=int(s['height']), fps=float(num) / float(den),
                n=int(s['nb_read_frames']))


def read_frames(path, size=None):
    """Yield RGB uint8 frames, optionally resized with an area filter."""
    info = probe(path)
    w, h = info['w'], info['h']
    vf = []
    if size:
        w, h = size
        vf = ['-vf', f'scale={w}:{h}:flags=area']
    proc = subprocess.Popen(
        ['ffmpeg', '-v', 'quiet', '-i', path, *vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
        stdout=subprocess.PIPE)
    frame_bytes = w * h * 3
    try:
        while True:
            buf = proc.stdout.read(frame_bytes)
            if len(buf) < frame_bytes:
                break
            yield np.frombuffer(buf, np.uint8).reshape(h, w, 3)
    finally:
        proc.stdout.close()
        proc.kill()
        proc.wait()


class PackedWriter:
    """Writes RGBA frames as an H.264 video with colour and alpha packed side by side."""

    GAP = 8  # pixels between the two halves, so compression never bleeds across

    def __init__(self, path, w, h, fps, layout='h', crf=20, keyframes=None, audio=None):
        self.w, self.h, self.layout = w, h, layout
        if layout == 'h':
            self.W, self.H = w * 2 + self.GAP, h
        elif layout == 'v':
            self.W, self.H = w, h * 2 + self.GAP
        else:  # colour only
            self.W, self.H = w, h
        assert self.W % 2 == 0 and self.H % 2 == 0, (self.W, self.H)
        cmd = ['ffmpeg', '-v', 'error', '-y',
               '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{self.W}x{self.H}',
               '-r', f'{fps}', '-i', '-']
        if audio:
            cmd += ['-i', audio['src'], '-map', '0:v', '-map', '1:a']
            if audio.get('start'):
                cmd[cmd.index(audio['src']) - 1:cmd.index(audio['src'])] = ['-ss', str(audio['start']), '-i']
        cmd += ['-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
                '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf),
                '-profile:v', 'high', '-level', '4.0',
                '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
                '-movflags', '+faststart']
        if keyframes:
            cmd += ['-force_key_frames', ','.join(f'{k:.4f}' for k in keyframes)]
        if audio:
            cmd += ['-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-shortest']
        else:
            cmd += ['-an']
        cmd.append(path)
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        self.count = 0

    def write(self, rgba):
        """rgba: float32 HxWx4 in 0..1 (straight alpha, colour already bled)."""
        rgb = np.clip(rgba[..., :3] * 255 + 0.5, 0, 255).astype(np.uint8)
        if self.layout == 'none':
            out = rgb
        else:
            a = np.clip(rgba[..., 3] * 255 + 0.5, 0, 255).astype(np.uint8)
            out = np.zeros((self.H, self.W, 3), np.uint8)
            out[:self.h, :self.w] = rgb
            if self.layout == 'h':
                out[:, self.w + self.GAP:] = a[..., None]
            else:
                out[self.h + self.GAP:, :] = a[..., None]
        self.proc.stdin.write(out.tobytes())
        self.count += 1

    def close(self):
        self.proc.stdin.close()
        self.proc.wait()


# --------------------------------------------------------------------------
# alpha estimation
# --------------------------------------------------------------------------
def key_strength(rgb, kind):
    """How strongly a pixel looks like the screen colour, independent of brightness
    (so the screen's own soft shadows are recognised as background too)."""
    f = rgb.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    if kind == 'green':
        return (g - np.maximum(r, b)) / (g + 20.0)
    return (np.minimum(r, b) - g) / (np.maximum(r, b) + 20.0)  # magenta


def chroma_alpha(rgb, kind, bg):
    k = key_strength(rgb, kind)
    k_bg = float(key_strength(np.asarray(bg, np.float32)[None, None], kind)[0, 0])
    return 1.0 - smoothstep(0.30 * k_bg, 0.70 * k_bg, k), k, k_bg


def light_alpha(rgb, bg, lo=9.0, hi=30.0):
    d = np.sqrt(((rgb.astype(np.float32) - bg) ** 2).sum(2))
    return smoothstep(lo, hi, d)


def fit_bg_model(rgb, thresh=22.0, order=2):
    """Smooth polynomial model of an off-white background (handles gentle gradients)."""
    h, w, _ = rgb.shape
    f = rgb.astype(np.float32)
    border = np.concatenate([f[:4].reshape(-1, 3), f[-4:].reshape(-1, 3),
                             f[:, :4].reshape(-1, 3), f[:, -4:].reshape(-1, 3)])
    med = np.median(border, 0)
    bgmask = np.sqrt(((f - med) ** 2).sum(2)) < thresh
    bgmask = cv2.erode(bgmask.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    ys, xs = np.nonzero(bgmask)
    sel = np.random.default_rng(0).choice(len(xs), size=min(40000, len(xs)), replace=False)
    ys, xs = ys[sel], xs[sel]
    terms = lambda X, Y: np.stack([X ** i * Y ** j for i in range(order + 1)
                                   for j in range(order + 1 - i)], -1)
    A = terms(xs / w - 0.5, ys / h - 0.5)
    Y, X = np.mgrid[0:h, 0:w]
    full = terms(X / w - 0.5, Y / h - 0.5).astype(np.float32)
    model = np.zeros((h, w, 3), np.float32)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A, f[ys, xs, c], rcond=None)
        model[..., c] = full @ coef.astype(np.float32)
    return model


def pushpull(rgb, weight):
    """Fill every pixel with the (distance-weighted) colour of the nearest weighted pixels."""
    c = rgb.astype(np.float32) * weight[..., None]
    w = weight.astype(np.float32)
    pyr = []
    while min(w.shape) > 6:
        pyr.append((c, w))
        c = cv2.pyrDown(c)
        w = cv2.pyrDown(w)
    fill = c / np.maximum(w, 1e-6)[..., None]
    for cl, wl in reversed(pyr):
        up = cv2.resize(fill, (cl.shape[1], cl.shape[0]), interpolation=cv2.INTER_LINEAR)
        cur = cl / np.maximum(wl, 1e-6)[..., None]
        k = np.clip(wl * 3.0, 0, 1)[..., None]
        fill = cur * k + up * (1 - k)
    return fill


def erode(mask, r):
    if r <= 0:
        return mask
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return cv2.erode(mask.astype(np.uint8), k) > 0


def refine(rgb, a0, bg_field=None, r=2, min_sep=18.0, ring=3):
    """Two-sided colour model on the uncertain edge band.

    Local foreground colour F and background colour B are diffused in from the
    confident regions; each edge pixel's alpha is its position on the F-B line.
    Returns (alpha, foreground colour)."""
    c = rgb.astype(np.float32)
    fg = erode(a0 > 0.97, r)
    bgc = erode(a0 < 0.03, r)
    if ring:
        # pixels close to the background may be tinted by it even if they look solid
        near = cv2.distanceTransform((~bgc).astype(np.uint8), cv2.DIST_L2, 3) <= ring
        fg &= ~near
    F = pushpull(c, fg.astype(np.float32))
    B = pushpull(c, bgc.astype(np.float32)) if bg_field is None else bg_field
    d = F - B
    den = (d * d).sum(2)
    a = ((c - B) * d).sum(2) / np.maximum(den, 1.0)
    a = np.clip(a, 0, 1)
    # only trust the estimate when the pixel really is a mix of F and B
    # (thin white petals next to a yellow flower centre are not)
    recon = a[..., None] * F + (1 - a[..., None]) * B
    err = np.sqrt(((c - recon) ** 2).sum(2))
    ok = (den > min_sep * min_sep) & (err < 26.0)
    unknown = ~(fg | bgc)
    alpha = np.where(unknown & ok, a, a0)
    alpha[fg] = 1.0
    alpha[bgc] = 0.0
    a3 = np.clip(alpha, 0.2, 1)[..., None]
    un = np.clip((c - (1 - a3) * B) / a3, 0, 255)
    t = smoothstep(0.15, 0.5, alpha)[..., None]
    col = np.where((unknown & ok)[..., None], F * (1 - t) + un * t, c)
    return alpha.astype(np.float32), col


def enclosed_components(alpha, max_area):
    """Label background-like pockets that do not touch the frame border."""
    bgl = (alpha < 0.5).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(bgl, connectivity=4)
    touches = np.zeros(n, bool)
    for edge in (lab[0], lab[-1], lab[:, 0], lab[:, -1]):
        touches[np.unique(edge)] = True
    area = stats[:, cv2.CC_STAT_AREA]
    cand = (~touches) & (area <= max_area)
    cand[0] = False
    return lab, cand


def fill_components(alpha, lab, keep):
    mask = keep[lab]
    if mask.any():
        m = cv2.dilate(mask.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32)
        m = cv2.GaussianBlur(m, (3, 3), 0)
        alpha = np.maximum(alpha, m)
    return alpha, mask


def component_mean(values, lab, n):
    s = np.bincount(lab.ravel(), weights=values.ravel(), minlength=n)
    c = np.bincount(lab.ravel(), minlength=n)
    return s / np.maximum(c, 1)


def edge_band(alpha, radius):
    """1 near the outer silhouette (where spill lives), 0 deep inside the character."""
    bg = (alpha < 0.5).astype(np.uint8)
    dist = cv2.distanceTransform(1 - bg, cv2.DIST_L2, 3)
    return (dist <= radius).astype(np.float32)


def despill(rgb, kind, band):
    f = rgb.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    out = f.copy()
    if kind == 'green':
        spill = np.maximum(0, g - np.maximum(r, b)) * band
        out[..., 1] = g - spill
        out[..., 0] += spill * 0.3
        out[..., 2] += spill * 0.3
    else:
        spill = np.maximum(0, np.minimum(r, b) - g) * band
        out[..., 0] = r - spill
        out[..., 2] = b - spill
        out[..., 1] += spill * 0.4
    return np.clip(out, 0, 255)


def bleed(rgb, alpha):
    """Push foreground colours out into the transparent area (prevents dark/green halos
    from texture filtering and video compression)."""
    fill = pushpull(rgb, np.clip(alpha * 2.0, 0, 1))
    keep = np.clip(alpha * 4.0, 0, 1)[..., None]
    return rgb.astype(np.float32) * keep + fill * (1 - keep)


def clean_alpha(alpha, lo=0.03, hi=0.97):
    a = (alpha - lo) / (hi - lo)
    return np.clip(a, 0, 1).astype(np.float32)
