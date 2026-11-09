import { fileURLToPath } from 'node:url';
import { serwist } from '@serwist/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { manifest } from './scripts/manifest.mjs';

import pkg from './package.json' with { type: 'json' };

const version = (pkg as { version: string }).version;

// The PWA and the API share one origin (AUTH.md 5: the refresh cookie and CSRF need it). In
// production Caddy serves dist/ and routes /api/v1 to the API; here the dev and preview servers
// proxy it, forwarding the client address for the API's TRUST_PROXY=loopback (D-072).
const apiOrigin = process.env.CSS_API_ORIGIN ?? 'http://127.0.0.1:4000';
const proxy = { '/api/v1': { target: apiOrigin, changeOrigin: false, xfwd: true } };

/** Serves and emits /manifest.webmanifest from the catalogue (scripts/manifest.mjs). */
function manifestPlugin(): Plugin {
  const body = () => JSON.stringify(manifest(), null, 2);
  return {
    name: 'css-manifest',
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(body());
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(body());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: body() });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    manifestPlugin(),
    serwist({
      swSrc: 'src/sw.ts',
      swDest: 'sw.js',
      globDirectory: 'dist',
      // the shell, its chunks, the manifest, the icons and the self-hosted fonts of the design brief open offline
      globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
      injectionPoint: 'self.__SW_MANIFEST',
      rollupFormat: 'iife',
      devOptions: { bundle: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    // Workspace packages resolve to their TypeScript sources in dev and tests (vitest.shared.mts)
    // and to dist/ in builds, through the "@css/source" export condition.
    conditions: process.env.NODE_ENV === 'production' ? [] : ['@css/source'],
  },
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) },
  // Bound to 127.0.0.1 so that Playwright, curl and the docs reach the same address (localhost
  // may resolve to ::1 only on some machines); the Docker web service passes --host 0.0.0.0 and
  // VITE_WATCH_POLL=1, because changes on a bind mount reach a container only by polling.
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    proxy,
    ...(process.env.VITE_WATCH_POLL ? { watch: { usePolling: true, interval: 1000 } } : {}),
  },
  preview: { host: '127.0.0.1', port: 3100, strictPort: true, proxy },
  build: { sourcemap: false },
});
