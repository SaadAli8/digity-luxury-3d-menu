import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const MODEL_URL =
  'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Avocado/glTF-Binary/Avocado.glb';

const outPath = path.resolve(process.cwd(), 'public', 'models', 'dish.glb');

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
          reject(new Error(`Download failed (${res.statusCode})`));
          res.resume();
          return;
        }

        const total = Number(res.headers['content-length'] || 0);
        let received = 0;

        const file = fs.createWriteStream(dest);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.round((received / total) * 100);
            process.stdout.write(`\rDownloading model… ${pct}%`);
          } else {
            process.stdout.write(`\rDownloading model… ${Math.round(received / 1024)} KB`);
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
  ensureDir(outPath);
  console.log(`Saving to: ${outPath}`);
  await download(MODEL_URL, outPath);
  console.log('Done. The app will now load /models/dish.glb');
  console.log('License: CC0 (via Khronos glTF Sample Models - Avocado).');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

