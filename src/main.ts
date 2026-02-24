import './styles.css';
import { LuxuryViewer } from './three/viewer';
import { loadDishOrPlaceholder, loadHdrEnvironmentMap } from './three/loaders';

// -------------------------
// CONFIG (edit this section)
// -------------------------
const CONFIG = {
  hdrPath: '/hdr/studio_small_08_1k.hdr',
  autoRotate: true,
  pixelRatioCap: 1.5,
  preferHdrEnvironment: true,
};

type DishId = 'avocado' | 'fish' | 'olives' | 'sushi' | 'water' | 'tea';

type DishConfig = {
  name: string;
  price: string;
  description: string;
  modelPath: string;
  remoteModelUrl?: string;
  targetMaxSize: number;
  ar?: {
    /** USDZ file path for iOS Quick Look (e.g. /models/foo.usdz) */
    usdzPath?: string;
  };
  credit?: string;
};

const DISHES: Record<
  DishId,
  DishConfig
> = {
  avocado: {
    name: 'Avocado Tartare',
    price: '$18',
    description: 'Hand-cut avocado with citrus salt, herb oil, and a warm toasted crunch.',
    modelPath: '/models/avocado.glb',
    remoteModelUrl:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Avocado/glTF-Binary/Avocado.glb',
    targetMaxSize: 0.52,
    credit: 'Avocado model: CC0 (Microsoft) via Khronos glTF Sample Assets.',
  },
  fish: {
    name: 'Barramundi, Studio-Seared',
    price: '$36',
    description: 'Crisp skin, soft finish — balanced with a clean, modern sauce.',
    modelPath: '/models/barramundi_fish.glb',
    remoteModelUrl:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BarramundiFish/glTF-Binary/BarramundiFish.glb',
    targetMaxSize: 1.35,
    credit: 'Barramundi Fish model: CC0 (Microsoft) via Khronos glTF Sample Assets.',
  },
  olives: {
    name: 'Olives, Iridescent Dish',
    price: '$28',
    description: 'A reflective glass presentation with soft highlights and premium reflections.',
    modelPath: '/models/iridescent_dish_olives.glb',
    remoteModelUrl:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/IridescentDishWithOlives/glTF-Binary/IridescentDishWithOlives.glb',
    targetMaxSize: 1.35,
    credit: 'Iridescent Dish with Olives: CC BY 4.0 (Wayfair LLC) via Khronos glTF Sample Assets.',
  },
  sushi: {
    name: 'Sushi Boat, Nigiri',
    price: '$48',
    description: 'Nigiri assortment presented on a cedar boat with clean cuts and bright finish.',
    modelPath: '/models/sushi_boat_nigiri.glb',
    targetMaxSize: 1.15,
    ar: {
      // iOS Quick Look needs USDZ; place it in public/models when available
      usdzPath: '/models/sushi_boat_nigiri.usdz',
    },
    credit: 'Client-provided sushi model (used with permission).',
  },
  water: {
    name: 'Sparkling Water',
    price: '$8',
    description: 'Chilled still or sparkling, with citrus or herbs on request.',
    modelPath: '/models/water_bottle.glb',
    remoteModelUrl:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/WaterBottle/glTF-Binary/WaterBottle.glb',
    targetMaxSize: 1.0,
    credit: 'Water Bottle model: CC0 (Microsoft) via Khronos glTF Sample Assets.',
  },
  tea: {
    name: 'Afternoon Tea',
    price: '$14',
    description: 'House blend with delicate pastries and a touch of honey.',
    modelPath: '/models/teacup.glb',
    remoteModelUrl:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DiffuseTransmissionTeacup/glTF-Binary/DiffuseTransmissionTeacup.glb',
    targetMaxSize: 1.2,
    credit: 'Teacup model: CC0 via Khronos glTF Sample Assets.',
  },
};

function isLowEndDevice(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 8;
  const mem = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 8;
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 380;
  return cores <= 4 || mem <= 4 || (smallScreen && window.devicePixelRatio > 2);
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

const ui = {
  dishName: () => $('dishName'),
  dishDesc: () => $('dishDesc'),
  dishPrice: () => $('dishPrice'),
  arButton: () => $('arButton') as HTMLAnchorElement,
  arToast: () => $('arToast'),
  loader: () => $('loader'),
  progressBar: () => $('progressBar'),
  progressPct: () => $('progressPct'),
  progressHint: () => $('progressHint'),
  dropMsg: () => $('dropMsg'),
  dropToast: () => $('dropToast'),
  viewer: () => $('viewer'),
};

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

function isIOS(): boolean {
  // iPadOS often reports as Mac; detect touch points.
  const ua = navigator.userAgent;
  const iOSLike = /iPad|iPhone|iPod/i.test(ua);
  const iPadOs = navigator.platform === 'MacIntel' && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints;
  return iOSLike || Boolean(iPadOs);
}

let arToastTimer: number | null = null;
function showArToast(message: string): void {
  if (arToastTimer != null) window.clearTimeout(arToastTimer);
  ui.arToast().textContent = message;
  ui.arToast().hidden = false;
  arToastTimer = window.setTimeout(() => {
    ui.arToast().hidden = true;
    arToastTimer = null;
  }, 4200);
}

function setArButtonForDish(id: DishId): void {
  const btn = ui.arButton();
  const cfg = DISHES[id];

  // Only show AR button when AR is configured (client sushi).
  if (!cfg.ar) {
    btn.hidden = true;
    btn.onclick = null;
    btn.removeAttribute('rel');
    btn.removeAttribute('target');
    btn.href = '#';
    return;
  }

  btn.hidden = false;
  btn.textContent = 'View in AR';
  btn.removeAttribute('target');

  btn.onclick = (e) => {
    const title = cfg.name;
    const glbUrl = new URL(cfg.modelPath, window.location.origin).toString();

    // Android: open Google Scene Viewer (AR camera placement)
    if (isAndroid()) {
      e.preventDefault();
      const fallback = window.location.href;
      const intent = `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(glbUrl)}&mode=ar_only&title=${encodeURIComponent(title)}#Intent;scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(
        fallback,
      )};end;`;
      window.location.href = intent;
      return;
    }

    // iOS: open Quick Look (AR camera placement) using USDZ
    if (isIOS()) {
      const usdzPath = cfg.ar?.usdzPath;
      if (!usdzPath) {
        e.preventDefault();
        showArToast('iPhone/iPad AR needs a .usdz file. Add it to /public/models/ and redeploy.');
        return;
      }

      // Important: iOS Quick Look is most reliable when the *actual* tapped element
      // is an <a rel="ar" href="...usdz"> link (no synthetic clicks).
      btn.setAttribute('rel', 'ar');
      btn.href = new URL(usdzPath, window.location.origin).toString();
      // Allow default navigation to Quick Look.
      return;
    }

    // Desktop: open the model file in a new tab
    e.preventDefault();
    btn.removeAttribute('rel');
    btn.href = glbUrl;
    window.open(glbUrl, '_blank', 'noopener,noreferrer');
  };
}

function setProgress(pct: number, hint: string): void {
  const clamped = Math.max(0, Math.min(100, pct));
  ui.progressBar().style.width = `${clamped.toFixed(1)}%`;
  ui.progressPct().textContent = `${Math.round(clamped)}%`;
  ui.progressHint().textContent = hint;
  ui.loader().querySelector<HTMLElement>('.progress')?.setAttribute('aria-valuenow', `${Math.round(clamped)}`);
}

function hideLoaderSoon(): void {
  window.setTimeout(() => ui.loader().classList.add('is-hidden'), 260);
}

async function boot(): Promise<void> {
  const initial: DishId = 'sushi';
  const setDishText = (id: DishId) => {
    ui.dishName().textContent = DISHES[id].name;
    ui.dishDesc().textContent = DISHES[id].description;
    ui.dishPrice().textContent = DISHES[id].price;
    setArButtonForDish(id);
  };
  setDishText(initial);

  setProgress(0, 'Preparing viewer…');

  const shadowsEnabled = !isLowEndDevice();

  const viewer = new LuxuryViewer({
    container: ui.viewer(),
    shadowsEnabled,
    pixelRatioCap: CONFIG.pixelRatioCap,
    autoRotate: CONFIG.autoRotate,
  });
  viewer.start();

  setProgress(8, shadowsEnabled ? 'Warming lights…' : 'Optimizing for device…');

  if (CONFIG.preferHdrEnvironment) {
    setProgress(14, 'Loading studio lighting…');
    const env = await loadHdrEnvironmentMap(viewer.renderer, CONFIG.hdrPath);
    if (env) viewer.setEnvironmentMap(env);
    else setProgress(16, 'Studio lighting fallback…');
  }

  const loadDish = async (id: DishId) => {
    setDishText(id);
    ui.dropMsg().hidden = true;
    ui.dropToast().hidden = true;
    ui.loader().classList.remove('is-hidden');

    setProgress(22, 'Loading dish…');
    const cfg = DISHES[id];

    const onProgress = (p: { pct: number }) => {
      const eased = 22 + Math.min(70, p.pct * 0.7);
      setProgress(eased, 'Loading dish…');
    };

    const loadSingle = async (modelUrl: string, targetMaxSize: number) =>
      loadDishOrPlaceholder({
        modelUrl,
        shadowsEnabled,
        id,
        onProgress,
        targetMaxSize,
      });

    const loadWithRemoteFallback = async (localUrl: string, remoteUrl: string | undefined, targetMaxSize: number) => {
      const local = await loadSingle(localUrl, targetMaxSize);
      if (!local.usedPlaceholder) return local;
      if (!local.missingModelFile) return local;
      if (!remoteUrl) return local;

      setProgress(40, 'Loading premium model…');
      const remote = await loadSingle(remoteUrl, targetMaxSize);
      return remote.usedPlaceholder ? local : remote;
    };

    const dish = await loadWithRemoteFallback(cfg.modelPath, cfg.remoteModelUrl, cfg.targetMaxSize);
    viewer.setObject(dish.root);
    // Sushi model looks better static; other dishes use gentle auto-rotate
    viewer.setAutoRotate(CONFIG.autoRotate);

    setProgress(100, 'Ready');
    hideLoaderSoon();
  };

  // Wire selector UI
  const selector = document.querySelector('.selector');
  selector?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null;
    const id = t?.getAttribute?.('data-dish') as DishId | null;
    if (!id || !(id in DISHES)) return;
    selector.querySelectorAll<HTMLElement>('.chip').forEach((b) => b.classList.toggle('is-active', b === t));
    void loadDish(id);
  });

  await loadDish(initial);

  // FPS debug UI removed for client demo polish.
}

boot().catch((err) => {
  console.error(err);
  setProgress(100, 'Failed to start');
});

