import * as THREE from 'three';

export type SceneConfig = {
  shadowsEnabled: boolean;
};

export type SceneBundle = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  stage: THREE.Group;
  setShadowsEnabled: (enabled: boolean) => void;
};

function configureShadow(light: THREE.DirectionalLight, size = 1024): void {
  light.shadow.mapSize.set(size, size);
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = 20;
  light.shadow.camera.left = -3.0;
  light.shadow.camera.right = 3.0;
  light.shadow.camera.top = 3.0;
  light.shadow.camera.bottom = -3.0;
  light.shadow.bias = -0.00012;
  light.shadow.normalBias = 0.02;
}

export function createScene(cfg: SceneConfig): SceneBundle {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(0.0, 0.9, 2.7);

  const stage = new THREE.Group();
  stage.name = 'stage';
  scene.add(stage);

  const floorGeo = new THREE.CircleGeometry(2.2, 96);
  const shadowCatcher = new THREE.Mesh(
    floorGeo,
    new THREE.ShadowMaterial({
      opacity: cfg.shadowsEnabled ? 0.28 : 0.0,
    }),
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = -0.0005;
  shadowCatcher.receiveShadow = cfg.shadowsEnabled;
  shadowCatcher.name = 'shadowCatcher';
  stage.add(shadowCatcher);

  const ambient = new THREE.AmbientLight(new THREE.Color(1, 1, 1), 0.26);
  ambient.name = 'ambient';
  scene.add(ambient);

  const key = new THREE.DirectionalLight(new THREE.Color(1.0, 0.97, 0.93), 3.2);
  key.position.set(2.4, 3.4, 1.8);
  key.castShadow = cfg.shadowsEnabled;
  key.name = 'key';
  configureShadow(key, 1024);
  scene.add(key);

  const fill = new THREE.DirectionalLight(new THREE.Color(0.92, 0.95, 1.0), 1.15);
  fill.position.set(-2.8, 2.2, 2.4);
  fill.castShadow = false;
  fill.name = 'fill';
  scene.add(fill);

  const rim = new THREE.DirectionalLight(new THREE.Color(1.0, 1.0, 1.0), 1.9);
  rim.position.set(0.2, 2.8, -2.8);
  rim.castShadow = false;
  rim.name = 'rim';
  scene.add(rim);

  const setShadowsEnabled = (enabled: boolean) => {
    key.castShadow = enabled;
    shadowCatcher.receiveShadow = enabled;
    (shadowCatcher.material as THREE.ShadowMaterial).opacity = enabled ? 0.28 : 0.0;
    stage.traverse((obj: THREE.Object3D) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = enabled;
      obj.receiveShadow = enabled;
    });
  };

  return { scene, camera, stage, setShadowsEnabled };
}

