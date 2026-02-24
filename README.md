# DIGITY Luxury 3D Menu (POC)

A production-quality proof of concept showcasing a luxury UI + smooth Three.js interaction + performance-minded loading.

## Tech

- Vite + Vanilla TypeScript
- Three.js (GLTFLoader + OrbitControls)
- Deploy-ready for Vercel/Netlify

## Project structure

```
/index.html
/src/main.ts
/src/three/scene.ts
/src/three/viewer.ts
/src/three/loaders.ts
/src/styles.css
/public/models/*.glb                 (3D models served by the site)
/public/hdr/studio_small_08_1k.hdr   (optional HDR)
```

## Run locally

From the project folder:

```bash
npm install
npm run dev
```

Build + preview production output:

```bash
npm run build
npm run preview
```

## Replace the dish model

1. Put your model here: `public/models/dish.glb`
2. Keep materials PBR-friendly (metal/roughness) for best results under studio lighting.
3. If `dish.glb` is missing, the app renders a premium placeholder and shows:
   “Drop your dish.glb into /public/models/”

### Optional: download a ready-to-use model (instant upgrade)

If you don’t have a dish model yet, you can download a high-quality sample GLB (Avocado) and save it as `dish.glb`:

```bash
npm run fetch:model
```

- Source: Khronos glTF Sample Models → Avocado
- License: **CC0** (public domain). See the model README in the upstream repo.

## Demo models (real dishes)

To download real demo models (good for client demos):

```bash
npm run fetch:demo-models
```

Models downloaded into `public/models/`:
- `avocado.glb` — CC0 (Microsoft) via Khronos glTF Sample Assets
- `barramundi_fish.glb` — CC0 (Microsoft) via Khronos glTF Sample Assets
- `iridescent_dish_olives.glb` — CC BY 4.0 (Wayfair LLC) via Khronos glTF Sample Assets (**attribution required**)
- `water_bottle.glb` — CC0 (Microsoft) via Khronos glTF Sample Assets
- `teacup.glb` — CC0 via Khronos glTF Sample Assets

### Client-provided sushi file

The client shared this file:

- `sushi_boat_nigiri.glb` (currently placed in the project root: `./sushi_boat_nigiri.glb`)

For the website to load it in production, it must be in:

- `public/models/sushi_boat_nigiri.glb` (served at `/models/sushi_boat_nigiri.glb`)

Notes:
- If you **don’t** download these files, the app will try loading the same models from their **upstream raw URLs** automatically (then fall back to a premium placeholder only if that also fails).
- The client sushi model is **local only** (no upstream fallback URL).

### Asset guidance (performance)

- **GLB size**: aim for **~5–8MB** (or less) for the first model on mobile.
- **Textures**: prefer **1K–2K**; avoid 4K unless absolutely necessary.
- **Geometry**: remove hidden faces, reduce excessive subdivisions.
- **Compression** (optional, Phase 2):
  - Draco mesh compression can help, but it requires shipping Draco decoders.
  - This POC includes DRACO support hooks, but it is not enabled by default.

## Optional HDR studio environment

- Add an HDR file at `public/hdr/studio_small_08_1k.hdr`
- If missing, the viewer automatically falls back to a 3-light “studio” setup.

## Deploy on Vercel (exact steps)

### Option A: Vercel Dashboard (recommended)

1. Push this folder to a Git repo (GitHub/GitLab/Bitbucket).
2. In Vercel: **New Project** → import the repo.
3. Framework preset: **Vite**
4. Build command: `npm run build`
5. Output directory: `dist`
6. Deploy.

### Option B: Vercel CLI

```bash
npm install
npm run build
npx vercel
```

When prompted:
- Build command: `npm run build`
- Output directory: `dist`

## How to prove performance (Lighthouse + 4G)

1. Build and run preview:

```bash
npm run build
npm run preview
```

2. Open Chrome DevTools → **Lighthouse**
   - Mode: **Navigation**
   - Device: **Mobile**
   - Throttling: **Simulated mobile** (or Custom)
   - Run Lighthouse and capture the report.

3. For a stricter check:
   - DevTools → **Network**
   - Throttling: **Fast 4G** (or “Regular 4G” if available)
   - Disable cache
   - Hard reload and verify:
     - loader appears immediately
     - first meaningful view happens quickly
     - model download is the dominant cost (optimize GLB/texture sizes)

