import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export type ProgressInfo = {
  loaded: number;
  total?: number;
  pct: number;
};

export type LoadDishOptions = {
  modelUrl: string;
  shadowsEnabled: boolean;
  onProgress?: (info: ProgressInfo) => void;
  useDraco?: boolean;
  dracoDecoderPath?: string;
  targetMaxSize?: number;
  id?: string;
};

async function resourceProbablyExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    return res.ok;
  } catch {
    return true;
  }
}

function createGltfLoader(useDraco?: boolean, dracoDecoderPath?: string): GLTFLoader {
  const loader = new GLTFLoader();
  if (useDraco) {
    const draco = new DRACOLoader();
    draco.setDecoderPath(dracoDecoderPath ?? '/draco/');
    loader.setDRACOLoader(draco);
  }
  return loader;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function computePct(loaded: number, total?: number): number {
  if (!total || total <= 0) return 0;
  return clamp01(loaded / total) * 100;
}

export async function loadHdrEnvironmentMap(
  renderer: THREE.WebGLRenderer,
  hdrUrl: string,
): Promise<THREE.Texture | null> {
  try {
    const rgbe = new RGBELoader();
    rgbe.setDataType(THREE.HalfFloatType);
    const hdr = await rgbe.loadAsync(hdrUrl);

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envMap = pmrem.fromEquirectangular(hdr).texture;

    hdr.dispose();
    pmrem.dispose();

    return envMap;
  } catch {
    return null;
  }
}

function applyModelDefaults(root: THREE.Object3D, shadowsEnabled: boolean): void {
  root.traverse((obj: THREE.Object3D) => {
    if (!(obj instanceof THREE.Mesh)) return;

    obj.castShadow = shadowsEnabled;
    obj.receiveShadow = shadowsEnabled;

    const mat = obj.material;
    if (Array.isArray(mat)) {
      for (const m of mat) {
        if (m && 'envMapIntensity' in m) (m as THREE.MeshStandardMaterial).envMapIntensity = 0.85;
      }
    } else if (mat && 'envMapIntensity' in mat) {
      (mat as THREE.MeshStandardMaterial).envMapIntensity = 0.85;
    }
  });
}

function tuneModelById(root: THREE.Object3D, id?: string): void {
  if (id !== 'sushi') return;

  // Presentational orientation: face the camera with a premium angle.
  root.rotation.y = Math.PI * 0.28;

  // Reduce “plastic” feel by softening reflections and specular.
  root.traverse((obj: THREE.Object3D) => {
    if (!(obj instanceof THREE.Mesh)) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;

      const mat = m as unknown as THREE.MeshStandardMaterial & Partial<THREE.MeshPhysicalMaterial>;

      if (typeof mat.envMapIntensity === 'number') mat.envMapIntensity = Math.min(mat.envMapIntensity, 0.6);
      if (typeof mat.metalness === 'number') mat.metalness = Math.min(mat.metalness, 0.18);
      if (typeof mat.roughness === 'number') mat.roughness = Math.max(mat.roughness, 0.32);

      if (typeof mat.clearcoat === 'number') mat.clearcoat = Math.min(mat.clearcoat, 0.25);
      if (typeof mat.clearcoatRoughness === 'number') mat.clearcoatRoughness = Math.max(mat.clearcoatRoughness, 0.28);

      (m as THREE.Material).needsUpdate = true;
    }
  });
}

function centerAndScale(root: THREE.Object3D, targetMaxSize: number): void {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  root.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) {
    const s = targetMaxSize / maxDim;
    root.scale.setScalar(s);
  }
}

function placeOnStage(root: THREE.Object3D): { height: number; radius: number } {
  const box = new THREE.Box3().setFromObject(root);
  root.position.y -= box.min.y;

  const size = box.getSize(new THREE.Vector3());
  const height = Math.max(0.0001, size.y);
  const radius = 0.5 * Math.max(size.x, size.y, size.z);
  return { height, radius };
}

function makeCanvasLabel(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(c);

  ctx.clearRect(0, 0, c.width, c.height);

  const grad = ctx.createLinearGradient(0, 0, c.width, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.00)');
  grad.addColorStop(0.12, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.70)');
  grad.addColorStop(0.88, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0.00)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.strokeStyle = 'rgba(212, 175, 99, 0.65)';
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, c.width - 48, c.height - 48);

  ctx.fillStyle = 'rgba(242, 242, 244, 0.95)';
  ctx.font = '600 92px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

function createPlateBase(shadowsEnabled: boolean): { group: THREE.Group; topY: number } {
  const g = new THREE.Group();

  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.22, 0.0),
    new THREE.Vector2(0.86, 0.02),
    new THREE.Vector2(0.94, 0.08),
    new THREE.Vector2(0.88, 0.12),
    new THREE.Vector2(0.62, 0.135),
    new THREE.Vector2(0.36, 0.132),
    new THREE.Vector2(0.22, 0.122),
    new THREE.Vector2(0.0, 0.12),
  ];
  const plateGeo = new THREE.LatheGeometry(profile, 168);
  const plateMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.98, 0.98, 0.985),
    roughness: 0.34,
    metalness: 0.04,
    clearcoat: 0.85,
    clearcoatRoughness: 0.22,
    sheen: 0.25,
    sheenRoughness: 0.7,
  });
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.castShadow = shadowsEnabled;
  plate.receiveShadow = shadowsEnabled;

  const rimGeo = new THREE.TorusGeometry(0.84, 0.012, 18, 200);
  const rimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.78, 0.65, 0.40),
    roughness: 0.22,
    metalness: 0.9,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.132;
  rim.castShadow = shadowsEnabled;

  g.add(plate, rim);
  return { group: g, topY: 0.135 };
}

function createSteakDish(shadowsEnabled: boolean): THREE.Group {
  const g = new THREE.Group();
  const { group: plate, topY } = createPlateBase(shadowsEnabled);
  g.add(plate);

  const steakGeo = new THREE.BoxGeometry(0.72, 0.11, 0.46, 18, 6, 14);
  const pos = steakGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const edge = Math.max(Math.abs(x) / 0.36, Math.abs(z) / 0.23);
    const wobble = (1.0 - Math.min(1, edge)) * 0.012;
    pos.setXYZ(i, x + (Math.sin(z * 12) * 0.004), y + (Math.sin(x * 10) * wobble), z + (Math.cos(x * 12) * 0.004));
  }
  steakGeo.computeVertexNormals();

  const steakMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.22, 0.10, 0.06),
    roughness: 0.62,
    metalness: 0.02,
    clearcoat: 0.12,
    clearcoatRoughness: 0.55,
  });
  const steak = new THREE.Mesh(steakGeo, steakMat);
  steak.position.set(0, topY + 0.07, 0.02);
  steak.rotation.y = -0.35;
  steak.castShadow = shadowsEnabled;
  steak.receiveShadow = shadowsEnabled;

  const glazeGeo = new THREE.BoxGeometry(0.74, 0.02, 0.48, 6, 1, 6);
  const glazeMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.08, 0.06, 0.05),
    roughness: 0.18,
    metalness: 0.05,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 0.72,
  });
  const glaze = new THREE.Mesh(glazeGeo, glazeMat);
  glaze.position.set(0, topY + 0.11, 0.02);
  glaze.rotation.y = -0.35;
  glaze.castShadow = shadowsEnabled;
  glaze.receiveShadow = shadowsEnabled;

  const greensMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.10, 0.22, 0.14),
    roughness: 0.85,
    metalness: 0.0,
  });
  for (let i = 0; i < 9; i++) {
    const leafGeo = new THREE.SphereGeometry(0.045 + Math.random() * 0.02, 18, 12);
    const leaf = new THREE.Mesh(leafGeo, greensMat);
    leaf.scale.set(1.4, 0.65, 1.1);
    leaf.position.set(0.26 + (Math.random() * 0.18), topY + 0.06 + Math.random() * 0.03, -0.18 + (Math.random() * 0.26));
    leaf.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.6);
    leaf.castShadow = shadowsEnabled;
    g.add(leaf);
  }

  const crumbMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.78, 0.65, 0.40),
    roughness: 0.55,
    metalness: 0.08,
  });
  for (let i = 0; i < 18; i++) {
    const s = 0.010 + Math.random() * 0.012;
    const p = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), crumbMat);
    p.position.set(-0.24 + Math.random() * 0.48, topY + 0.035 + Math.random() * 0.035, -0.20 + Math.random() * 0.40);
    p.castShadow = shadowsEnabled;
    g.add(p);
  }

  g.add(steak, glaze);
  g.rotation.y = Math.PI * 0.1;
  return g;
}

function createSushiDish(shadowsEnabled: boolean): THREE.Group {
  const g = new THREE.Group();
  const { group: plate, topY } = createPlateBase(shadowsEnabled);
  g.add(plate);

  const riceMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.94, 0.94, 0.955),
    roughness: 0.6,
    metalness: 0.0,
    clearcoat: 0.2,
    clearcoatRoughness: 0.7,
  });
  const fishMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.62, 0.18, 0.16),
    roughness: 0.42,
    metalness: 0.0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.22,
  });
  const noriMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.03, 0.05, 0.04),
    roughness: 0.95,
    metalness: 0.0,
  });

  const nigiriPositions: Array<[number, number, number, number]> = [
    [-0.34, 0.0, -0.14, 0.25],
    [-0.10, 0.0, -0.12, -0.15],
    [0.14, 0.0, -0.10, 0.12],
    [0.36, 0.0, -0.08, -0.22],
  ];

  for (const [x, _y, z, ry] of nigiriPositions) {
    const rice = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.10, 6, 14), riceMat);
    rice.rotation.z = Math.PI / 2;
    rice.position.set(x, topY + 0.06, z);
    rice.rotation.y = ry;
    rice.castShadow = shadowsEnabled;
    rice.receiveShadow = shadowsEnabled;

    const fish = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.03, 0.075, 6, 1, 4), fishMat);
    fish.position.set(x, topY + 0.10, z);
    fish.rotation.y = ry + 0.18;
    fish.castShadow = shadowsEnabled;
    fish.receiveShadow = shadowsEnabled;

    g.add(rice, fish);
  }

  for (let i = 0; i < 6; i++) {
    const cx = -0.30 + i * 0.12;
    const cz = 0.18 + (i % 2) * 0.04;
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 24), riceMat);
    roll.rotation.x = Math.PI / 2;
    roll.position.set(cx, topY + 0.05, cz);
    roll.castShadow = shadowsEnabled;
    roll.receiveShadow = shadowsEnabled;

    const nori = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.062, 24, 1, true), noriMat);
    nori.rotation.x = Math.PI / 2;
    nori.position.copy(roll.position);
    nori.castShadow = shadowsEnabled;
    nori.receiveShadow = shadowsEnabled;

    const center = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.065, 16), new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.16, 0.22, 0.08),
      roughness: 0.9,
    }));
    center.rotation.x = Math.PI / 2;
    center.position.copy(roll.position);
    center.castShadow = shadowsEnabled;

    g.add(roll, nori, center);
  }

  const wasabi = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.06, 18), new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.20, 0.34, 0.10),
    roughness: 0.95,
  }));
  wasabi.position.set(0.42, topY + 0.055, 0.18);
  wasabi.rotation.x = Math.PI;
  wasabi.castShadow = shadowsEnabled;
  g.add(wasabi);

  const ginger = new THREE.Mesh(new THREE.TorusKnotGeometry(0.05, 0.015, 80, 12), new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.92, 0.72, 0.72),
    roughness: 0.6,
    clearcoat: 0.25,
    clearcoatRoughness: 0.6,
  }));
  ginger.position.set(0.38, topY + 0.06, 0.03);
  ginger.rotation.set(0.7, -0.2, 0.6);
  ginger.castShadow = shadowsEnabled;
  g.add(ginger);

  g.rotation.y = Math.PI * 0.1;
  return g;
}

function createPastaDish(shadowsEnabled: boolean): THREE.Group {
  const g = new THREE.Group();

  const bowlProfile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.30, 0.0),
    new THREE.Vector2(0.62, 0.04),
    new THREE.Vector2(0.72, 0.12),
    new THREE.Vector2(0.74, 0.24),
    new THREE.Vector2(0.68, 0.30),
    new THREE.Vector2(0.48, 0.32),
    new THREE.Vector2(0.24, 0.31),
    new THREE.Vector2(0.0, 0.30),
  ];
  const bowlGeo = new THREE.LatheGeometry(bowlProfile, 140);
  const bowlMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.975, 0.975, 0.98),
    roughness: 0.28,
    metalness: 0.03,
    clearcoat: 0.85,
    clearcoatRoughness: 0.22,
    sheen: 0.2,
    sheenRoughness: 0.8,
  });
  const bowl = new THREE.Mesh(bowlGeo, bowlMat);
  bowl.castShadow = shadowsEnabled;
  bowl.receiveShadow = shadowsEnabled;
  g.add(bowl);

  const sauce = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.10, 80), new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.86, 0.76, 0.62),
    roughness: 0.35,
    metalness: 0.0,
    clearcoat: 0.45,
    clearcoatRoughness: 0.35,
  }));
  sauce.position.y = 0.16;
  sauce.castShadow = shadowsEnabled;
  sauce.receiveShadow = shadowsEnabled;
  g.add(sauce);

  const noodleMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.92, 0.84, 0.62),
    roughness: 0.55,
    metalness: 0.0,
    clearcoat: 0.25,
    clearcoatRoughness: 0.55,
  });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 0.16 + (i % 4) * 0.05;
    const p0 = new THREE.Vector3(Math.cos(a) * r, 0.17 + Math.sin(i) * 0.01, Math.sin(a) * r);
    const p1 = new THREE.Vector3(Math.cos(a + 1.2) * (r + 0.10), 0.19 + Math.cos(i) * 0.015, Math.sin(a + 1.2) * (r + 0.10));
    const p2 = new THREE.Vector3(Math.cos(a + 2.2) * (r + 0.02), 0.20 + Math.sin(i * 0.7) * 0.012, Math.sin(a + 2.2) * (r + 0.02));
    const curve = new THREE.CatmullRomCurve3([p0, p1, p2]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 0.012, 10, false), noodleMat);
    tube.castShadow = shadowsEnabled;
    tube.receiveShadow = shadowsEnabled;
    g.add(tube);
  }

  const shavingsMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.95, 0.93, 0.90),
    roughness: 0.85,
    metalness: 0.0,
  });
  for (let i = 0; i < 18; i++) {
    const shave = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.018), shavingsMat);
    shave.position.set((Math.random() - 0.5) * 0.55, 0.225 + Math.random() * 0.025, (Math.random() - 0.5) * 0.55);
    shave.rotation.set(-Math.PI / 2 + (Math.random() * 0.4), Math.random() * Math.PI * 2, Math.random() * 0.4);
    shave.castShadow = shadowsEnabled;
    g.add(shave);
  }

  g.rotation.y = Math.PI * 0.1;
  return g;
}

function createDessertDish(shadowsEnabled: boolean): THREE.Group {
  const g = new THREE.Group();
  const { group: plate, topY } = createPlateBase(shadowsEnabled);
  g.add(plate);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.08, 64), new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.42, 0.26, 0.14),
    roughness: 0.82,
  }));
  base.position.y = topY + 0.04;
  base.castShadow = shadowsEnabled;
  base.receiveShadow = shadowsEnabled;

  const filling = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.06, 64), new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.86, 0.76, 0.62),
    roughness: 0.35,
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
  }));
  filling.position.y = topY + 0.09;
  filling.castShadow = shadowsEnabled;
  filling.receiveShadow = shadowsEnabled;

  const cream = new THREE.Mesh(new THREE.SphereGeometry(0.11, 40, 26), new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.95, 0.95, 0.96),
    roughness: 0.28,
    clearcoat: 0.5,
    clearcoatRoughness: 0.28,
  }));
  cream.scale.set(1.2, 0.85, 1.2);
  cream.position.set(-0.02, topY + 0.135, 0.01);
  cream.castShadow = shadowsEnabled;
  cream.receiveShadow = shadowsEnabled;

  const berryMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.60, 0.08, 0.12),
    roughness: 0.3,
    clearcoat: 0.9,
    clearcoatRoughness: 0.15,
  });
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.03 + Math.random() * 0.01, 24, 18), berryMat);
    b.position.set(-0.08 + Math.random() * 0.18, topY + 0.155 + Math.random() * 0.03, -0.06 + Math.random() * 0.18);
    b.castShadow = shadowsEnabled;
    g.add(b);
  }

  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.06, 18), new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.10, 0.28, 0.16),
    roughness: 0.9,
  }));
  leaf.position.set(0.12, topY + 0.18, 0.02);
  leaf.rotation.set(-0.8, 0.2, 1.0);
  leaf.castShadow = shadowsEnabled;

  g.add(base, filling, cream, leaf);
  g.rotation.y = Math.PI * 0.12;
  return g;
}

function createColaSet(shadowsEnabled: boolean): THREE.Group {
  const g = new THREE.Group();

  // tray
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.60, 0.64, 0.05, 100), new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.06, 0.06, 0.07),
    roughness: 0.25,
    metalness: 0.15,
    clearcoat: 0.85,
    clearcoatRoughness: 0.18,
  }));
  tray.position.y = 0.025;
  tray.castShadow = shadowsEnabled;
  tray.receiveShadow = shadowsEnabled;
  g.add(tray);

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.98, 0.98, 0.99),
    roughness: 0.05,
    metalness: 0.0,
    transmission: 1.0,
    thickness: 0.12,
    ior: 1.48,
    clearcoat: 0.25,
    clearcoatRoughness: 0.12,
  });
  const colaMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.08, 0.05, 0.03),
    roughness: 0.22,
    metalness: 0.0,
    transmission: 0.2,
    thickness: 0.6,
    ior: 1.35,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
  });

  // bottle (outer glass)
  const bottleProfile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.16, 0.0),
    new THREE.Vector2(0.18, 0.06),
    new THREE.Vector2(0.16, 0.18),
    new THREE.Vector2(0.14, 0.38),
    new THREE.Vector2(0.16, 0.54),
    new THREE.Vector2(0.15, 0.72),
    new THREE.Vector2(0.11, 0.90),
    new THREE.Vector2(0.08, 1.02),
    new THREE.Vector2(0.07, 1.12),
    new THREE.Vector2(0.0, 1.14),
  ];
  const bottle = new THREE.Mesh(new THREE.LatheGeometry(bottleProfile, 180), glassMat);
  bottle.position.set(-0.10, 0.05, -0.02);
  bottle.castShadow = shadowsEnabled;
  bottle.receiveShadow = shadowsEnabled;
  g.add(bottle);

  // liquid inside
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.145, 0.72, 70), colaMat);
  liquid.position.set(-0.10, 0.05 + 0.30, -0.02);
  liquid.castShadow = shadowsEnabled;
  liquid.receiveShadow = shadowsEnabled;
  g.add(liquid);

  // cap
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 42), new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.10, 0.10, 0.12),
    roughness: 0.35,
    metalness: 0.75,
  }));
  cap.position.set(-0.10, 0.05 + 1.155, -0.02);
  cap.castShadow = shadowsEnabled;
  g.add(cap);

  // label band
  const labelTex = makeCanvasLabel('DIGITY COLA');
  const labelMat = new THREE.MeshStandardMaterial({
    map: labelTex,
    roughness: 0.55,
    metalness: 0.05,
    transparent: true,
    opacity: 0.95,
  });
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.162, 0.24, 120, 1, true), labelMat);
  label.position.set(-0.10, 0.05 + 0.62, -0.02);
  label.castShadow = shadowsEnabled;
  g.add(label);

  // glasses
  const glassGeo = new THREE.CylinderGeometry(0.10, 0.12, 0.22, 48, 1, true);
  const baseGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.01, 48);
  const g1 = new THREE.Mesh(glassGeo, glassMat);
  g1.position.set(0.22, 0.05 + 0.11, 0.12);
  g1.castShadow = shadowsEnabled;
  g1.receiveShadow = shadowsEnabled;
  const g1b = new THREE.Mesh(baseGeo, glassMat);
  g1b.position.set(0.22, 0.05 + 0.005, 0.12);
  g1b.castShadow = shadowsEnabled;

  const g2 = g1.clone();
  g2.position.set(0.30, 0.05 + 0.11, -0.06);
  g2.rotation.y = 0.35;
  const g2b = g1b.clone();
  g2b.position.set(0.30, 0.05 + 0.005, -0.06);

  const fill1 = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.12, 44), colaMat);
  fill1.position.set(0.22, 0.05 + 0.06, 0.12);
  const fill2 = fill1.clone();
  fill2.position.set(0.30, 0.05 + 0.05, -0.06);
  fill2.scale.y = 0.85;

  fill1.castShadow = shadowsEnabled;
  fill2.castShadow = shadowsEnabled;
  g.add(g1, g1b, g2, g2b, fill1, fill2);

  g.rotation.y = Math.PI * 0.12;
  return g;
}

function createLuxuryPlaceholder(shadowsEnabled: boolean, id?: string): THREE.Group {
  switch (id) {
    case 'cola':
      return createColaSet(shadowsEnabled);
    case 'dessert':
      return createDessertDish(shadowsEnabled);
    default: {
      const g = new THREE.Group();
      const { group: plate, topY } = createPlateBase(shadowsEnabled);
      g.add(plate);

      const sauceGeo = new THREE.CylinderGeometry(0.46, 0.52, 0.06, 120);
      const sauceMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0.14, 0.14, 0.16),
        roughness: 0.16,
        metalness: 0.08,
        clearcoat: 0.92,
        clearcoatRoughness: 0.18,
      });
      const sauce = new THREE.Mesh(sauceGeo, sauceMat);
      sauce.position.y = topY - 0.02;
      sauce.castShadow = shadowsEnabled;
      sauce.receiveShadow = shadowsEnabled;

      const domeGeo = new THREE.SphereGeometry(0.40, 96, 64, 0, Math.PI * 2, 0, Math.PI * 0.55);
      const domeMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0.92, 0.92, 0.94),
        roughness: 0.15,
        metalness: 0.05,
        clearcoat: 0.92,
        clearcoatRoughness: 0.20,
      });
      const dome = new THREE.Mesh(domeGeo, domeMat);
      dome.position.y = topY + 0.085;
      dome.castShadow = shadowsEnabled;
      dome.receiveShadow = shadowsEnabled;

      const garnishGeo = new THREE.SphereGeometry(0.045, 32, 22);
      const garnishMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.78, 0.65, 0.40),
        roughness: 0.35,
        metalness: 0.55,
      });
      const garnish = new THREE.Mesh(garnishGeo, garnishMat);
      garnish.position.set(0.22, topY + 0.115, 0.08);
      garnish.castShadow = shadowsEnabled;

      g.add(sauce, dome, garnish);
      g.rotation.y = Math.PI * 0.15;
      return g;
    }
  }
}

export async function loadDishOrPlaceholder(opts: LoadDishOptions): Promise<{
  root: THREE.Object3D;
  usedPlaceholder: boolean;
  missingModelFile: boolean;
}> {
  const targetMaxSize = opts.targetMaxSize ?? 1.7;
  const exists = await resourceProbablyExists(opts.modelUrl);

  if (!exists) {
    const placeholder = createLuxuryPlaceholder(opts.shadowsEnabled, opts.id);
    centerAndScale(placeholder, targetMaxSize);
    placeOnStage(placeholder);
    return { root: placeholder, usedPlaceholder: true, missingModelFile: true };
  }

  const loader = createGltfLoader(opts.useDraco, opts.dracoDecoderPath);

  try {
    const gltf = await new Promise<THREE.Object3D>((resolve, reject) => {
      loader.load(
        opts.modelUrl,
        (g: GLTF) => resolve(g.scene),
        (evt: ProgressEvent<EventTarget>) => {
          const info: ProgressInfo = {
            loaded: evt.loaded,
            total: evt.total,
            pct: computePct(evt.loaded, evt.total),
          };
          opts.onProgress?.(info);
        },
        (err: unknown) => reject(err),
      );
    });

    applyModelDefaults(gltf, opts.shadowsEnabled);
    tuneModelById(gltf, opts.id);
    centerAndScale(gltf, targetMaxSize);
    placeOnStage(gltf);

    return { root: gltf, usedPlaceholder: false, missingModelFile: false };
  } catch {
    const placeholder = createLuxuryPlaceholder(opts.shadowsEnabled, opts.id);
    centerAndScale(placeholder, targetMaxSize);
    placeOnStage(placeholder);
    return { root: placeholder, usedPlaceholder: true, missingModelFile: true };
  }
}

