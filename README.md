# 🌿 The Memory Garden — AR Companion for the Pop-Up Book

The digital layer of the pop-up book **The Memory Garden**: a WebAR app that runs **in the mobile browser with no app install**. Point the phone at a **Scan Here** icon printed in the book and that page's animated memory steps out of the paper, anchored to the page, with light, weather and particle effects around it.

**Live:** https://erfansol.github.io/memory-garden-ar/

| Scene | Scan Here icon | What happens in AR |
|---|---|---|
| 1 — Memories | 🌻 sunflower | **Summer.** Diana and Liam (seen from behind) play with their shadows; the shadows move on the wall in front of them. Golden motes and petals drift by. |
| | ☂️ umbrellas | **Autumn.** The two of them on the swing under the maple tree, with soft rain, falling leaves and ripples on the puddles. |
| | ⛄ snowman | **Winter.** Two snow angels in a patch of snow lying on the page, with snowfall and glints. Every season arrives with a Sims-style spin, a beam of light and a burst of sparkles. |
| 7 — The Doll | 🐰 bunny | 1. the window opens → 2. the wind blows (with a wind sound) → 3. the drawings on the desk are blown to the floor → 4. a paper plane flies out of the window and lands on the Scan Me bunny → 5. Diana appears standing in the middle with her doll, sits down and plays with it; *When your feelings become too heavy, you can hold something soft to help you feel safe.* appears above her head, and the sitting and playing loops. |
| 8 — Planting Seeds | 🕳️ seed hole | Diana appears three times in three places on the page and plants a seed (the same animation), first among falling flower petals, then orange autumn leaves, then snow. While she kneels to plant, a line appears above her head (*When a memory feels close, you can plant a seed for it.* / *You can do it once, or again, whenever the feeling returns.* / *There is no wrong way to remember; you can take the time and space you need.*). Each seed answers with a soft light and a sprout, and the planted mound stays behind. |
| 9 — The Memory Garden | 💐 flower bush | Diana and the flowering bush loop in the wind. A paper plane glides in from the left and out to the right, and along its path five blue and violet flowers grow one after another, then keep swaying gently. |

All characters are the animation videos from `Final Animations`, with their backgrounds removed (see below).

---

## ▶️ Try it on this computer (Preview, no camera)

```bash
cd "/Volumes/Erfan SSD/01_Projects/farnaz/memory-garden-ar"
python3 -m http.server 8642
```

Open **http://localhost:8642** and press **Preview** on any scene. Drag to orbit, scroll to zoom, and press ⟲ to replay. The paper pop-up pieces (walls, bed, bushes) are shown as stand-ins, so this mode is also good for showing the project on a projector.

## 📱 On the phone (real AR)

1. Open **https://erfansol.github.io/memory-garden-ar/** in Safari (iPhone) or Chrome (Android).
2. Press **Scan the Book** (or **AR Mode** on a scene) → **Start the camera** → allow the camera.
3. Point the camera at a **Scan Here** icon. Frame the icon first so it locks on, then move back to see the whole page.

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
├── targets/          the six icons + targets.mind (compiled tracking data)
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
python3 tools/prepare_pages.py                 # icons + ground pages from Final Animations
node tools/compile-targets.mjs                 # icons → targets/targets.mind
```

For the Node tools run `npm install --ignore-scripts` (the native `canvas` package that mind-ar lists is not needed; the compiler script feeds pixels directly).

## 🧪 Tests

```bash
node tools/test-preview.mjs              # every scene in Chrome: errors + screenshots in tools/shots/
node tools/test-preview.mjs 8 5,20,40    # scene 8 at 5 s, 20 s and 40 s
node tools/test-ar.mjs                   # real tracking with a simulated camera showing the test pages
```

## ⚠️ Troubleshooting

| Problem | Fix |
|---|---|
| Camera does not open | The address must be https (or localhost); allow the camera in the browser settings |
| Icon never locks | More light, flatter page; fill the screen with the icon first, then move back |
| Memory looks edge-on | Characters turn to face you; the flat winter patch is best seen from above at an angle |
| Slow on an older phone | Close other tabs; lower the particle `count` values in `js/scenes` |
