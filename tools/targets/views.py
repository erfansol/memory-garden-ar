"""Renders a page as a phone camera would see it: from the front of the book, at a given
elevation angle (90 = straight down), with a 64° field of view.

    python3 tools/targets/views.py <page image> <out.y4m> <elevation,...> [seconds per view] [--sweep]

--sweep renders one continuous move from the first elevation to the last (to test
whether tracking holds on while the phone is lowered).
"""
import subprocess
import sys

import cv2
import numpy as np

W, H, FOV = 1280, 960, 64.0


def view(page, elev, dist=1.25, yaw=0.0):
    """page lies in the XY plane (1 unit wide, centred); camera looks at its centre."""
    ph, pw = page.shape[:2]
    aspect = ph / pw
    e = np.radians(elev)
    y = np.radians(yaw)
    cam = np.array([np.sin(y) * np.cos(e) * dist, -np.cos(y) * np.cos(e) * dist, np.sin(e) * dist])
    fwd = -cam / np.linalg.norm(cam)
    up0 = np.array([0, 1.0, 0]) if elev > 89 else np.array([0, 0, 1.0])
    right = np.cross(fwd, up0); right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    f = (W / 2) / np.tan(np.radians(FOV / 2))
    def project(p):
        d = p - cam
        return np.array([W / 2 + f * d.dot(right) / d.dot(fwd), H / 2 - f * d.dot(up) / d.dot(fwd)])
    corners = np.array([[-0.5, aspect / 2, 0], [0.5, aspect / 2, 0], [0.5, -aspect / 2, 0], [-0.5, -aspect / 2, 0]])
    dst = np.float32([project(c) for c in corners])
    src = np.float32([[0, 0], [pw, 0], [pw, ph], [0, ph]])
    M = cv2.getPerspectiveTransform(src, dst)
    bg = np.full((H, W, 3), (70, 80, 90), np.uint8)
    out = cv2.warpPerspective(page, M, (W, H), dst=bg, borderMode=cv2.BORDER_TRANSPARENT, flags=cv2.INTER_AREA)
    return out


def main():
    page = cv2.imread(sys.argv[1])
    out = sys.argv[2]
    elevs = [float(x) for x in sys.argv[3].split(',')]
    secs = float(sys.argv[4]) if len(sys.argv) > 4 and not sys.argv[4].startswith('--') else 4
    fps = 10
    frames = []
    if '--sweep' in sys.argv:
        n = int(secs * fps)
        for i in range(n):
            k = i / (n - 1)
            e = elevs[0] + (elevs[-1] - elevs[0]) * k
            frames.append(view(page, e, yaw=4 * np.sin(k * 6)))
    else:
        for e in elevs:
            v = view(page, e)
            frames += [v] * int(secs * fps)
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}',
                          '-r', str(fps), '-i', '-', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    for fr in frames:
        p.stdin.write(fr.tobytes())
    p.stdin.close()
    p.wait()
    cv2.imwrite(out.replace('.y4m', '_last.jpg'), frames[-1])


if __name__ == '__main__':
    main()
