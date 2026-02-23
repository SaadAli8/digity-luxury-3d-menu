import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const MODELS = [
  {
    out: 'public/models/avocado.glb',
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Avocado/glTF-Binary/Avocado.glb',
    license: 'CC0 (Microsoft)',
  },
  {
    out: 'public/models/barramundi_fish.glb',
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BarramundiFish/glTF-Binary/BarramundiFish.glb',
    license: 'CC0 (Microsoft)',
  },
  {
    out: 'public/models/iridescent_dish_olives.glb',
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/IridescentDishWithOlives/glTF-Binary/IridescentDishWithOlives.glb',
    license: 'CC BY 4.0 (Wayfair LLC) - attribution required',
  },
  // Real food scans/models (MIT licensed) from XR Gourmet (code4fukui/xrgourmet).
  {
    out: 'public/models/sushi.glb',
    url: 'https://raw.githubusercontent.com/code4fukui/xrgourmet/main/kanematsu-sasimiteisyoku.glb',
    license: 'MIT (code4fukui/xrgourmet)',
  },
];

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(download(res.headers.location, dest));
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed (${res.statusCode}) for ${url}`));
          res.resume();
          return;
        }

        const total = Number(res.headers['content-length'] || 0);
        let received = 0;

        ensureDir(dest);
        const file = fs.createWriteStream(dest);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.round((received / total) * 100);
            process.stdout.write(`\r${path.basename(dest)} … ${pct}%`);
          } else {
            process.stdout.write(`\r${path.basename(dest)} … ${Math.round(received / 1024)} KB`);
          }
        });
        res.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            process.stdout.write('\n');
            resolve();
          });
        });
        file.on('error', (err) => {
          file.close(() => reject(err));
        });
      })
      .on('error', reject);
  });
}

async function main() {
  console.log('Downloading demo food models…');
  for (const m of MODELS) {
    console.log(`- ${m.out} (${m.license})`);
    const outPath = path.resolve(process.cwd(), m.out);
    await download(m.url, outPath);
  }
  console.log('Done.');
  console.log('Tip: run `npm run dev` and use the Featured selector.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

