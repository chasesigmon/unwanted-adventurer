import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Its own dev port so it never collides with the text client (5173) if
// both happen to be running. Build output lives at dist/client, a
// sibling of the server's own dist/server (see app.controller.ts) —
// entirely inside game2d/, never touching the repo root's own dist/.
export default defineConfig({
  root: __dirname,
  envDir: __dirname,
  // Character/floor/door PNGs live in game2d/assets/ (not the Vite-
  // conventional "public/") — served as-is at the site root in both dev
  // and build (vite copies publicDir's contents into build.outDir).
  publicDir: path.resolve(__dirname, 'assets'),
  server: {
    port: 5175,
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
});
