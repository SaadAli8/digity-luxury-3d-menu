import * as THREE from 'three';
import { decompressFrames, parseGIF } from 'gifuct-js';

export type AnimatedTexture = {
  texture: THREE.Texture;
  update: (dtSeconds: number) => void;
  dispose: () => void;
};

function isVideo(url: string): boolean {
  return url.endsWith('.mp4') || url.endsWith('.webm') || url.endsWith('.ogg');
}

export async function createAnimatedTexture(url: string): Promise<AnimatedTexture> {
  if (isVideo(url)) {
    const video = document.createElement('video');
    video.src = url;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';

    // Attempt autoplay (will work for muted videos in most browsers).
    await video.play().catch(() => {
      // If autoplay is blocked, the texture will still work once playback starts.
    });

    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;

    return {
      texture: tex,
      update: () => {
        // VideoTexture updates itself during render; keep for API parity.
      },
      dispose: () => {
        tex.dispose();
        video.pause();
        video.removeAttribute('src');
        video.load();
      },
    };
  }

  // GIF path: decode frames and blit into a canvas texture.
  const buf = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch animated texture: ${url}`);
    return r.arrayBuffer();
  });

  const gif = parseGIF(buf);
  const frames = decompressFrames(gif, true);
  if (frames.length === 0) throw new Error(`No frames in GIF: ${url}`);

  const w = frames[0].dims.width;
  const h = frames[0].dims.height;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const imageData = ctx.createImageData(w, h);

  let frameIdx = 0;
  let accMs = 0;

  // Initialize first frame
  imageData.data.set(frames[0].patch);
  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  return {
    texture: tex,
    update: (dtSeconds: number) => {
      accMs += dtSeconds * 1000;

      // Advance frames based on their delay (in ms).
      // Clamp to a reasonable minimum delay to avoid hot loops.
      while (accMs > Math.max(16, frames[frameIdx].delay || 20)) {
        accMs -= Math.max(16, frames[frameIdx].delay || 20);
        frameIdx = (frameIdx + 1) % frames.length;

        imageData.data.set(frames[frameIdx].patch);
        ctx.putImageData(imageData, 0, 0);
        tex.needsUpdate = true;
      }
    },
    dispose: () => {
      tex.dispose();
    },
  };
}

