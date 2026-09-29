# 🌿 Where Memories Grow — AR Pop-Up Book

The digital layer of the pop-up book **Where Memories Grow**, written, illustrated and developed by **Farnaz Attar**: a WebAR app that runs **in the mobile browser with no app install**. Open a scene, point the phone at the pop-up, and that page's animated memory steps out of the paper, anchored to the book, with light, weather and particle effects around it.

**Live:** https://erfansol.github.io/memory-garden-ar/

| Scene | What you scan | What happens in AR |
|---|---|---|
| 1 — Memories | the classroom | **Summer.** Beside the right wall of the classroom pop-up, Diana and Liam (seen from behind) play with their shadows, which move on the outside of the wall. Golden motes and petals drift by. |
| | 〃 | **Autumn.** Behind the back wall (seen from the top edge of the book), the two of them on the swing under the maple tree, with soft rain, falling leaves and ripples on the puddles. |
| | 〃 | **Winter.** Two snow angels in a patch of snow lying over the printed angel outlines, with snowfall and glints. Every season arrives with a Sims-style spin, a beam of light and a burst of sparkles; afterwards everything stays fixed to the paper and the walls. |
| 7 — The Doll | the bedroom | 1. the window opens → 2. the wind blows (with a wind sound) → 3. the drawings on the desk are blown to the floor → 4. a paper plane flies out of the window and lands on the Scan Me bunny → 5. Diana appears standing in the middle with her doll, sits down and plays with it; *When your feelings become too heavy, you can hold something soft to help you feel safe.* appears above her head, and the sitting and playing loops. |
| 8 — Planting Seeds | the school garden | Diana appears three times in three places on the page and plants a seed (the same animation), first among falling flower petals, then orange autumn leaves, then snow. While she kneels to plant, a line appears above her head (*When a memory feels close, you can plant a seed for it.* / *You can do it once, or again, whenever the feeling returns.* / *There is no wrong way to remember; you can take the time and space you need.*). Each seed answers with a soft light and a sprout, and the planted mound stays behind. |
| 9 — The Memory Garden | the garden | The flowering bush is there from the start and Diana appears among it; both loop in the wind. A paper plane glides in from the left and out to the right, and along its path five flowers, white and blue in turn, grow in front of the bush, then keep swaying gently. |

All characters are the animation videos from `Final Animations`, with their backgrounds removed (see below).

---

## ▶️ Try it on this computer (Preview, no camera)

```bash
cd "/Volumes/Erfan SSD/01_Projects/farnaz/memory-garden-ar"
python3 -m http.server 8642
```

Open **http://localhost:8642** and press **Preview** on any scene. Drag to orbit, scroll to zoom, and press ⟲ to replay. The paper pop-up pieces are shown as stand-ins (the classroom folded into three walls from the print sheet, the bedroom wall, desk and bed, and Farnaz's three bush layers), so this mode is also good for showing the project on a projector. Characters and flowers are fixed to the page like paper cut-outs: they do not turn to follow the camera.

## 📱 On the phone (real AR)

1. Open **https://erfansol.github.io/memory-garden-ar/** in Safari (iPhone) or Chrome (Android).
2. Press **Scan the Book** (or **AR Mode** on a scene) → **Start the camera** → allow the camera.
3. Point the camera at the open pop-up, from the front (the way you read it) or from above. It locks on in a moment and stays while you move around.

No printed book at hand? Open **Test pages** (`targets.html`) on a computer screen or print them, and scan those.

Tips: keep the page flat and well lit, start close to the icon so it locks on, then move back. In AR the sound starts with the camera (the speaker button mutes it); in Preview it is off until you press the speaker.

After any change, publish again with:

```bash
git add -A && git commit -m "…" && git push
```

GitHub Pages redeploys the same link in a minute or two.

## 🗂 Project structure

```
memory-garden-ar/
├── index.html · app.html · targets.html   menu, player, printable test pages
├── css/style.css
├── js/
│   ├── app.js        Preview (orbit camera) and AR (MindAR) modes, one anchor per icon
│   ├── layout.js     page geometry + the six icons (where each sits on its page)
│   ├── video.js      transparent video: packed-alpha shader, dissolve, shadow, vignette, sway
│   ├── fx.js         particles, light rings/pillars, wind ribbons, paper planes, billboarding
│   ├── stage.js      Experience base class (timeline, pause/resume on tracking loss) + appear FX
│   ├── sound.js      optional Web Audio soundtrack
│   └── scenes/scene{1,7,8,9}.js
├── assets/video/     transparent clips (*.mp4) + clips.json (layout, loop points)
├── assets/audio/     soundtracks
├── assets/sceneN/    ground pages, pop-up stand-ins, flower growth atlases, planted mound
├── targets/          target images, targets.json/.js (with each target's page homography), sceneN.mind + all.mind
├── libs/             Three.js r147 + MindAR 1.2.5 (served locally, no CDN)
└── tools/            build and test scripts
```

Scene content is authored in **page units**: the open spread is 1 unit wide, the origin is its centre, X points right, Y towards the top edge of the page and Z up out of the paper. `layout.js` maps page units onto each icon, so a memory appears in the right place on the page whichever icon is scanned. Positions and sizes are the constants at the top of each `js/scenes/sceneN.js`.

## 🎞 How the transparent videos are made

`tools/video/build_videos.py` reads the raw animations from `../Final Animations` and writes `assets/video/*.mp4`. Each output is an ordinary H.264 video with the **colour and the alpha mask packed side by side**, so it plays on every phone (iPhone Safari included), and `js/video.js` recombines them on the GPU. The background is removed with a method chosen for each video:

| Clip | Source background | Method |
|---|---|---|
| summer kids, window | green screen | chroma key + edge colour model + despill; enclosed green details (palm trees on the shirt) are kept |
| Scene 7 girl, growing flowers | magenta screen | same, magenta key (its own soft shadow is removed too) |
| autumn swing | the same animation rendered on grey **and** on white | exact difference matting |
| Scene 8 girl | on white + on black | white version keyed; the black version marks what is certainly character (white shirt, sneakers) |
| Scene 9 girl, bush | off-white paper (flickering) | per-frame background model; an illustration segmentation model (isnet-anime) decides which enclosed white areas belong to her (collar, daisies) |
| winter angels | snow | kept as a patch; the shader melts its edges into the page |

Loops are made seamless by cross-fading the end into the beginning; Scene 7 plays the sitting-down once and then loops the sitting and playing. A character's words appear in a speech bubble that follows her head on screen, so they stay readable on a phone. The growing flowers become sprite-sheet atlases, so any number can grow at once without extra video decoders.

Rebuild (≈15 min; needs ffmpeg, `pip install numpy opencv-python-headless pillow "rembg[cpu]"`):

```bash
python3 tools/video/build_videos.py            # everything
python3 tools/video/build_videos.py s7_girl    # one clip
python3 tools/video/build_videos.py --preview  # key a few frames → tools/video/preview/
python3 tools/prepare_wall.py                  # Scene 1 classroom wall from the print sheet
python3 tools/video/measure_base.py            # where each clip touches the ground (runs after a build)
# tracking targets: see "How the book is recognised" below
```

For the Node tools run `npm install --ignore-scripts` (the native `canvas` package that mind-ar lists is not needed; the compiler script feeds pixels directly).

## 🎯 How the book is recognised

The printed book differs from the digital pages: most small *Scan Here* icons were not printed, the pop-up covers the middle of every spread, and people look at a pop-up from the front and low (20–55° above the table, measured on Farnaz's photos). MindAR also only searches a 256 px window of the 640×480 camera frame at a time. So each scene is recognised by:

- **photo targets** — Farnaz's own photos of the open book (`../newtargetpoints`), cropped to the pop-up and the page around it. They carry the real printed look and the pop-up standing up, exactly what a phone sees.
- **flat page targets** — each leaf of the spread seen from above (for looking straight down, and for the flat test pages).

Every target stores **G**, the homography from page units to its own image (for photos it comes from registering the photo to the page). `js/tracking.js` combines MindAR's pose of whichever target it tracks with G, and recovers the page's true position with a planar homography decomposition. The Stage then:
- smooths the pose on every rendered frame, steady when the phone is still and quick when it moves;
- ignores one-frame "flips" to a wrong pose; a jump is followed only after it has lasted 0.4 s;
- glides between targets instead of jumping;
- holds the last pose briefly when tracking drops. The memory keeps playing for 3 s before it pauses, so short drop-outs never interrupt it.

Rebuilding (≈10 min), after new photos go into `../newtargetpoints/extracted/`:

```bash
python3 tools/targets/register.py ../newtargetpoints/extracted/Targetpoints07 7 ../newtargetpoints/rectified   # per scene
python3 tools/targets/build_targets.py     # flat page targets + assets/sceneN/ground.jpg
python3 tools/targets/photo_targets.py     # photo targets (edit VIEWS to choose photos)
node tools/compile-targets.mjs             # → targets/sceneN.mind + targets/all.mind
```

Measured on photos that were **not** used as targets (Chrome's camera fed with the photo at 640×480):

| Scene | old Scan Here icons | new targets | jitter while still |
|---|---|---|---|
| 1 | 0 / 15 | 5 / 12 (every front view; side and back views were not covered then) | ≤ 2 px |
| 7 | 2 / 11 | 5 / 6 (20°–45°) | ≤ 7 px |
| 8 | 0 / 5 | 2 / 3 | ≤ 9 px |
| 9 | — (icon not printed) | 3 / 3 | ≤ 1 px |

After this measurement four more photos were added as targets (including a side view of the classroom), so the published set covers more angles than the table shows. Lock-on takes 0.4–0.9 s with a scene's own targets (AR Mode on a scene) and up to ~2 s in *Scan the Book*, which searches every scene.

## 🧪 Tests

```bash
node tools/test-preview.mjs              # every scene in Chrome: errors + screenshots in tools/shots/
node tools/test-preview.mjs 8 5,20,40    # scene 8 at 5 s, 20 s and 40 s
node tools/test-ar.mjs                   # AR with a simulated camera showing a photo of each scene
node tools/targets/eval_photos.mjs ../newtargetpoints/extracted/Targetpoints07 7   # every real photo (unseen ones only)
```

## ⚠️ Troubleshooting

| Problem | Fix |
|---|---|
| Camera does not open | The address must be https (or localhost); allow the camera in the browser settings |
| Icon never locks | More light, flatter page; fill the screen with the icon first, then move back |
| Memory looks edge-on | Characters turn to face you; the flat winter patch is best seen from above at an angle |
| Slow on an older phone | Close other tabs; lower the particle `count` values in `js/scenes` |

---

## Credits

**Where Memories Grow**
Written, illustrated and developed by **Farnaz Attar**

A practical project developed for the Master’s thesis
*Interactive Narratives for Emotional Learning: Developing an AR Pop-Up Book Framework for Explaining Death to Children*

MA in Design, Multimedia and Visual Communication · Sapienza University of Rome, 2026
Supervisor: Prof. Vincenzo Maselli
