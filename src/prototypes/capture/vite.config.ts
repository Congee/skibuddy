import { createReadStream, readFileSync, readdirSync, statSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import solid from 'vite-plugin-solid';

const root = resolve(import.meta.dirname, '../../..');
// Footage and SMPL-derived poses stay outside git; .claude is ignored.
const dataDir = resolve(process.env['CAPTURE_DIR'] ?? resolve(root, '.claude/capture'));
const PREFIX = '/capture-data/';
const TYPES: Readonly<Record<string, string>> = { '.json': 'application/json', '.mp4': 'video/mp4', '.webm': 'video/webm' };

/** Pose files are `<clip>_<stage>.json` whose head names a clip and carries joint angles. */
const listPoses = (): ReadonlyArray<{ readonly file: string; readonly clip: string; readonly stage: string }> =>
  readdirSync(dataDir).flatMap((file) => {
    const m = /^(.+)_([a-z0-9-]+)\.json$/.exec(file);
    if (m === null || m[2] === 'targets' || m[2] === 'gates') return [];
    const head = readFileSync(resolve(dataDir, file), 'utf8').slice(0, 4000);
    return head.includes('"clip"') && /"q"\s*:\s*\{/.test(head) ? [{ file, clip: m[1] ?? file, stage: m[2] ?? '' }] : [];
  });

// Video seeking needs byte ranges.
const sendFile = (path: string, range: string | undefined, res: ServerResponse): void => {
  const size = statSync(path).size;
  res.setHeader('Content-Type', TYPES[extname(path)] ?? 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-store');
  const m = range === undefined ? null : /bytes=(\d*)-(\d*)/.exec(range);
  if (m === null) {
    res.setHeader('Content-Length', size);
    createReadStream(path).pipe(res);
    return;
  }
  const start = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
  const end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1;
  res.statusCode = 206;
  res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  res.setHeader('Content-Length', end - start + 1);
  createReadStream(path, { start, end }).pipe(res);
};

const captureData = (): Plugin => ({
  name: 'capture-data',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = req.url ?? '';
      if (!url.startsWith(PREFIX)) return next();
      const name = decodeURIComponent(url.slice(PREFIX.length).split('?')[0] ?? '');
      try {
        if (name === 'index.json') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(listPoses()));
          return;
        }
        const path = resolve(dataDir, name);
        if (!path.startsWith(dataDir + sep)) throw new Error('outside the capture dir');
        sendFile(path, req.headers.range, res);
      } catch {
        res.statusCode = 404;
        res.end();
      }
    });
  },
});

// Dev only: CAPTURE_DIR=<dir with pose JSON and footage> bunx vite --config src/prototypes/capture/vite.config.ts --port 5199
export default defineConfig({
  root,
  plugins: [solid(), captureData()],
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  optimizeDeps: {
    entries: ['prototypes/capture.html'],
    include: ['three/webgpu', 'three/tsl', 'three/addons/loaders/GLTFLoader.js', 'three/addons/libs/meshopt_decoder.module.js'],
  },
  server: { host: 'localhost', strictPort: true },
});
