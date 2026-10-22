// Builds the playable demo (demo.html plus the app in ?demo mode) as a static
// site in dist-demo/, e.g. for GitHub Pages. The demo becomes index.html and
// the app moves to app.html. Run: bun run build:demo, or bun run demo to develop.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const OUT = resolve(__dirname, 'dist-demo');

function demoAsIndex(): Plugin {
  return {
    name: 'demo-as-index',
    apply: 'build',
    closeBundle() {
      renameSync(resolve(OUT, 'index.html'), resolve(OUT, 'app.html'));
      renameSync(resolve(OUT, 'demo.html'), resolve(OUT, 'index.html'));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), demoAsIndex()],
  build: {
    target: 'es2022',
    outDir: OUT,
    emptyOutDir: true,
    rollupOptions: {
      input: { app: resolve(__dirname, 'index.html'), demo: resolve(__dirname, 'demo.html') },
    },
  },
  server: { open: '/demo.html' },
});
