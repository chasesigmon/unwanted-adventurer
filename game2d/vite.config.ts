import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fully standalone from the rest of the repo — no backend, no shared
// types, its own dev port so it never collides with the text client
// (5173) if both happen to be running.
export default defineConfig({
  root: __dirname,
  server: {
    port: 5175,
  },
  build: {
    outDir: path.resolve(__dirname, '../dist/game2d'),
    emptyOutDir: true,
  },
});
