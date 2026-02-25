import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createScene, type SceneBundle } from './scene';

export type ViewerConfig = {
  container: HTMLElement;
  shadowsEnabled: boolean;
  pixelRatioCap?: number;
  autoRotate?: boolean;
};

export class LuxuryViewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly bundle: SceneBundle;
  readonly controls: OrbitControls;

  private pixelRatioCap: number;
  private framingPadding = 1.52;
  private ownedEnvironment: THREE.Texture | null = null;
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private isVisible = true;
  private debugFpsEl: HTMLElement | null = null;
  private currentRoot: THREE.Object3D | null = null;

  private fpsFrameCount = 0;
  private fpsLastT = performance.now();

  constructor(cfg: ViewerConfig) {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });

    THREE.ColorManagement.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = cfg.shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.pixelRatioCap = cfg.pixelRatioCap ?? 1.5;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelRatioCap));
    renderer.setClearColor(0x000000, 0);

    cfg.container.appendChild(renderer.domElement);

    const bundle = createScene({ shadowsEnabled: cfg.shadowsEnabled });
    this.renderer = renderer;
    this.bundle = bundle;
    this.applyDefaultEnvironment();

    const controls = new OrbitControls(bundle.camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.8;

    controls.autoRotate = cfg.autoRotate ?? true;
    controls.autoRotateSpeed = 0.2;

    controls.minDistance = 1.35;
    controls.maxDistance = 5.0;
    controls.minPolarAngle = Math.PI * 0.26;
    controls.maxPolarAngle = Math.PI * 0.62;

    controls.target.set(0, 0.25, 0);
    controls.update();

    this.controls = controls;

    this.handleResize();
    this.bindResize(cfg.container);
    this.bindVisibility();

    // Mobile browsers often settle layout/toolbars after first paint.
    // Re-run sizing a few times to keep the model centered without user interaction.
    requestAnimationFrame(() => this.handleResize());
    window.setTimeout(this.handleResize, 200);
    window.setTimeout(this.handleResize, 900);
  }

  setDebugFpsElement(el: HTMLElement | null): void {
    this.debugFpsEl = el;
  }

  setEnvironmentMap(env: THREE.Texture | null): void {
    if (this.ownedEnvironment) {
      this.ownedEnvironment.dispose();
      this.ownedEnvironment = null;
    }
    this.bundle.scene.environment = env;
    this.ownedEnvironment = env;
  }

  applyDefaultEnvironment(): void {
    // Lightweight “studio” reflections without shipping an HDR.
    // Creates a PMREM texture from a simple procedural environment.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileCubemapShader();

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const a = new THREE.DirectionalLight(0xffffff, 2.0);
    a.position.set(2, 4, 2);
    scene.add(a);
    const b = new THREE.DirectionalLight(0xffffff, 1.2);
    b.position.set(-3, 2, 1);
    scene.add(b);

    const rt = pmrem.fromScene(scene, 0.04);
    pmrem.dispose();

    this.bundle.scene.environment = rt.texture;
    this.ownedEnvironment = rt.texture;
  }

  setObject(root: THREE.Object3D): void {
    const stage = this.bundle.stage;

    for (let i = stage.children.length - 1; i >= 0; i--) {
      const child = stage.children[i];
      if (child.name !== 'shadowCatcher') stage.remove(child);
    }

    stage.add(root);
    this.currentRoot = root;

    this.frameObject(root);
  }

  setFramingPadding(padding: number): void {
    // Keep in a sensible range
    this.framingPadding = Math.max(1.1, Math.min(2.6, padding));
    if (this.currentRoot) this.frameObject(this.currentRoot);
  }

  private frameObject(root: THREE.Object3D): void {
    // Auto-frame for any model: keep composition premium and consistent.
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const height = Math.max(0.0001, size.y);
    const radius = 0.5 * Math.max(size.x, size.y, size.z);

    // Root is normalized (centered in XZ, placed on stage at Y=0), so keep target stable.
    this.controls.target.set(0, height * 0.36, 0);

    const cam = this.bundle.camera;
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * cam.aspect);
    const fitFov = Math.min(vFov, hFov);
    const distance = (radius / Math.sin(fitFov / 2)) * this.framingPadding;

    const minD = Math.max(1.35, distance * 0.7);
    const maxD = Math.max(minD + 0.8, distance * 2.0);
    this.controls.minDistance = minD;
    this.controls.maxDistance = maxD;

    cam.near = Math.max(0.05, radius / 40);
    cam.far = Math.max(40, radius * 80);
    cam.position.set(0, height * 0.58, distance);
    cam.updateProjectionMatrix();

    this.controls.update();
  }

  setShadowsEnabled(enabled: boolean): void {
    this.renderer.shadowMap.enabled = enabled;
    this.bundle.setShadowsEnabled(enabled);
    this.controls.update();
  }

  setAutoRotate(enabled: boolean): void {
    this.controls.autoRotate = enabled;
  }

  start(): void {
    if (this.rafId != null) return;
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);

      if (!this.isVisible) return;

      this.controls.update();
      this.renderer.render(this.bundle.scene, this.bundle.camera);
      this.updateFps();
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId == null) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  dispose(): void {
    this.stop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.controls.dispose();
    if (this.ownedEnvironment) {
      this.ownedEnvironment.dispose();
      this.ownedEnvironment = null;
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private bindResize(container: HTMLElement): void {
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    window.addEventListener('orientationchange', this.handleResize, { passive: true });
  }

  private bindVisibility(): void {
    const onVis = () => {
      this.isVisible = document.visibilityState === 'visible';
      if (this.isVisible) {
        this.fpsLastT = performance.now();
        this.fpsFrameCount = 0;
      }
    };
    document.addEventListener('visibilitychange', onVis, { passive: true });
  }

  private handleResize = (): void => {
    const canvas = this.renderer.domElement;
    const parent = canvas.parentElement;
    if (!parent) return;

    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelRatioCap));
    this.renderer.setSize(w, h, false);

    this.bundle.camera.aspect = w / h;
    this.bundle.camera.updateProjectionMatrix();

    // Keep current model framed/centered after any size/aspect change.
    if (this.currentRoot) this.frameObject(this.currentRoot);
  };

  private updateFps(): void {
    if (!this.debugFpsEl) return;

    this.fpsFrameCount++;
    const now = performance.now();
    const dt = now - this.fpsLastT;
    if (dt < 250) return;

    const fps = (this.fpsFrameCount / dt) * 1000;
    this.debugFpsEl.textContent = fps.toFixed(0);
    this.fpsLastT = now;
    this.fpsFrameCount = 0;
  }
}

