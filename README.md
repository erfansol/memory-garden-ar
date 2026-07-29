# 🌿 The Memory Garden — AR Companion for the Pop-Up Book

This project is the digital layer of the pop-up book **The Memory Garden**: a WebAR app that runs **in the mobile browser with no app install**. Point the camera at a printed page of the book and the memories come alive as an animated paper diorama sitting right on the page.

Four scenes are implemented, following the AR script in `Description.pdf`:

| Scene | Story beat | What you see in AR |
|---|---|---|
| 1 — Memories | Diana and Liam's classroom | The children pop out with their desks, shadow play on the wall, and the turning seasons (summer petals, autumn leaves and rain, winter snow and glowing snow angels) with a Sims-style spin between seasons |
| 7 — The Doll | Diana's bedroom | A breeze from the night window, paper planes and pages drifting down, Diana moving to her doll, the hug, and the message "You are not alone." |
| 8 — Planting Seeds | The school garden | Three seeds planted with three remembrance lines, sprouts appearing, and the garden growing stage by stage (using the book's own Small/Medium/Tall artworks) |
| 9 — The Memory Garden | The poetic ending | Wind moving through the flowering bushes (cross-faded BushFlow frames), swaying hair, floating petals and travelling paper planes |

---

## ▶️ Quick start on this computer (Preview, no camera)

1. Open a terminal in the project folder:

```bash
cd ~/Downloads/Farnaz_Memory_Garden/memory-garden-ar
python3 -m http.server 8642
```

2. Open **http://localhost:8642** in the browser.

3. Press **Preview** on any scene. Drag to orbit, scroll to zoom. This mode is perfect for development and for showing the scenes on a projector during your presentation.

> AR Mode also works on this computer with the webcam: hold the printed page (or even a photo of the page on your phone) in front of the camera.

## 📱 Running on a phone (real AR)

Mobile browsers require **HTTPS** for camera access. The easiest free option is GitHub Pages:

1. Create a new GitHub repository (e.g. `memory-garden-ar`).
2. Push this folder to it (`node_modules` and `tools/shots*` are not needed):

```bash
cd ~/Downloads/Farnaz_Memory_Garden/memory-garden-ar
git init
printf "node_modules/\ntools/shots*/\n" > .gitignore
git add . && git commit -m "Memory Garden WebAR"
git branch -M main
git remote add origin https://github.com/USERNAME/memory-garden-ar.git
git push -u origin main
```

3. In the repo: **Settings → Pages → Branch: main → Save**. After a minute or two you get:
`https://USERNAME.github.io/memory-garden-ar/`

4. Open that address on the phone → pick a scene → **AR Mode** → point the camera at the printed page of that scene.

Tips for good tracking:
- Keep the page **flat and well lit**; frame the whole page first so the tracker can lock on.
- Hold the phone **at an angle** (the way you would look at a pop-up card), not straight down — the cutouts stand upright on the page.
- The tracking target for each scene is the flat printed artwork of that page (`targets/sceneX.jpg`). If you don't have the printed book at hand, you can print those images or even display them on another screen.

## 🗂 Project structure

```
memory-garden-ar/
├── index.html            main menu
├── app.html              scene player (preview / ar via URL params)
├── css/style.css         styles
├── js/
│   ├── app.js            bootstraps both modes
│   ├── engine.js         engine: paper cutouts, particles, timing, captions
│   └── scenes/scene{1,7,8,9}.js   per-scene animation (pure functions of time → loopable)
├── assets/               processed art (cropped, background-removed, optimized)
├── targets/              target images + targets.mind (compiled tracking data)
├── libs/                 Three.js and MindAR served locally (no CDN)
└── tools/                build & test scripts
    ├── prepare-assets.mjs   builds assets from the raw book files
    ├── fix-alpha.mjs        background removal via flood fill
    ├── compile-targets.mjs  builds targets.mind (offline MindAR compiler)
    ├── test-preview.mjs     automated test of all 4 scenes + screenshots
    └── test-ar-track.mjs    AR tracking test with a simulated camera
```

## 🛠 Editing and extending

- **Move/adjust scene elements**: coordinates live in `js/scenes/*.js`. Units are relative to the page width (=1); X is right, Y is depth, Z is height above the paper.
- **Change the messages**: the `MSGS` array (scene 8) and the `caption(...)` strings in each scene.
- **Rebuild assets** after changing the raw art: `node tools/prepare-assets.mjs && node tools/fix-alpha.mjs`
- **Rebuild tracking targets** (if the printed page designs change): `node tools/compile-targets.mjs`
- **Automated tests**: `node tools/test-preview.mjs` (requires `npm i playwright` and the server running on port 8642)

## ⚠️ Troubleshooting

| Problem | Fix |
|---|---|
| Camera won't open | The URL must be https or localhost; grant camera permission in the browser settings |
| Target never locks | More light, flatter page, frame the whole page first; avoid casting hand shadows on it |
| Scene looks edge-on / invisible | Tilt the phone; don't look straight down at the page |
| Runs slowly | Close other tabs; on older phones reduce particle counts in `js/scenes` |

---

Built with Three.js + MindAR (open source and free) — every asset comes from the book's own artwork.
