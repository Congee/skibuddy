// Builds src/pwa/sw.ts to <base>sw.js with the hashed file list, and links the manifest and icons.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { HtmlTagDescriptor, Plugin, ResolvedConfig } from 'vite';
import { versionKey } from '../../src/pwa/policy';
import type { SwManifest } from '../../src/pwa/policy';

const SW_ENTRY = 'sw';
const SW_FILE = 'sw.js';
const PLACEHOLDER = 'SKIBUDDY_SW_MANIFEST';
const CONTENT = 'content.json';
const MODEL = 'models/anatomy.glb';
const WEB_MANIFEST = 'manifest.webmanifest';
const ICONS = [
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/favicon.svg',
];

const digest = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex').slice(0, 12);

const link = (attrs: Record<string, string>): HtmlTagDescriptor => ({ tag: 'link', attrs, injectTo: 'head' });

export const pwa = (): Plugin => {
  let config: ResolvedConfig;
  const href = (path: string): string => `${config.base}${path}`;
  const fromPublic = (path: string): Buffer => readFileSync(join(config.publicDir, path));
  return {
    name: 'skibuddy:pwa',
    config: (_user, env) =>
      env.command === 'build'
        ? {
            build: {
              rolldownOptions: {
                input: { index: resolve('index.html'), [SW_ENTRY]: resolve('src/pwa/sw.ts') },
                output: {
                  entryFileNames: (chunk) => (chunk.name === SW_ENTRY ? SW_FILE : 'assets/[name]-[hash].js'),
                },
              },
            },
          }
        : undefined,
    configResolved: (resolved) => {
      config = resolved;
    },
    transformIndexHtml: (): HtmlTagDescriptor[] => [
      link({ rel: 'manifest', href: href(WEB_MANIFEST) }),
      link({ rel: 'icon', href: href('icons/favicon.svg'), type: 'image/svg+xml' }),
      link({ rel: 'icon', href: href('icons/favicon-32.png'), sizes: '32x32', type: 'image/png' }),
      link({ rel: 'apple-touch-icon', href: href('icons/apple-touch-icon.png') }),
    ],
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const sw = bundle[SW_FILE];
        if (sw?.type !== 'chunk') return this.error(`${SW_FILE} was not built`);
        // Registered as a classic script, so it must stand alone.
        if (sw.imports.length > 0 || sw.dynamicImports.length > 0 || sw.exports.length > 0) {
          return this.error(`${SW_FILE} must not import or export (got ${[...sw.imports, ...sw.exports].join(', ')})`);
        }
        const html = bundle['index.html'];
        if (html?.type !== 'asset') return this.error('index.html was not built');

        const hashed = Object.keys(bundle).filter((name) => name !== SW_FILE && name !== 'index.html' && !name.endsWith('.map'));
        const unhashed = [CONTENT, WEB_MANIFEST, ...ICONS];
        const shell = ['index.html', ...hashed, ...unhashed];
        const model = { path: MODEL, hash: digest(fromPublic(MODEL)) };
        const key = versionKey([
          ['index.html', digest(html.source)],
          ...hashed.map((name) => [name, name] as const),
          ...unhashed.map((path) => [path, digest(fromPublic(path))] as const),
          [MODEL, model.hash],
        ]);
        const manifest: SwManifest = { version: digest(key), shell, content: CONTENT, model };

        const parts = sw.code.split(PLACEHOLDER);
        if (parts.length !== 2) return this.error(`${SW_FILE}: expected one ${PLACEHOLDER}, found ${parts.length - 1}`);
        sw.code = parts.join(`(${JSON.stringify(manifest)})`);
        sw.map = null;
      },
    },
  };
};
