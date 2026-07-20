import path from 'path';
import { existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { Controller, Get, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Compiled to dist/server/app.controller.js — dist/client is its sibling
// (see ../vite.config.ts's own outDir).
const clientDist = path.resolve(__dirname, '../client');

// SPA fallback for the built client (dev mode serves the client
// separately via Vite, same split as the root project).
//
// A real bug lived here: this handler used to unconditionally
// `sendFile('index.html', ...)` for EVERY path, including the built JS
// bundle itself (/assets/index-XXXX.js) — since fastifyStatic is
// registered with `wildcard: false` (main.ts), nothing else ever served
// that file, so the browser's own `<script type="module" src="/assets/
// ...">` request got back index.html with a text/html content-type
// instead of the real JS, which every browser refuses to execute as a
// module (a strict MIME-type check per the HTML spec) — silently
// breaking EVERY page load through this server (login, register,
// everything), while dev-mode Vite (a separate port) was unaffected.
// Now: serve the real file if the requested path actually exists under
// dist/client (assets, images, ...), and only fall back to index.html
// for the SPA's own routes that don't correspond to a real file.
@Controller()
export class AppController {
  @Get('*')
  serveClient(@Req() req: FastifyRequest, @Res() reply: FastifyReply): void {
    const requestedPath = decodeURIComponent(req.url.split('?')[0] ?? '/');
    const resolved = path.normalize(path.join(clientDist, requestedPath));
    const isRealFile =
      requestedPath !== '/' &&
      resolved.startsWith(clientDist) &&
      existsSync(resolved) &&
      statSync(resolved).isFile();

    if (isRealFile) {
      reply.sendFile(requestedPath, clientDist);
    } else {
      reply.type('text/html').sendFile('index.html', clientDist);
    }
  }
}
