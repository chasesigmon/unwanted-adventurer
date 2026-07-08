import path from 'path';
import { fileURLToPath } from 'url';
import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Compiled to dist/server/app.controller.js — dist/client is its sibling
// (see ../vite.config.ts's own outDir).
const clientDist = path.resolve(__dirname, '../client');

// SPA fallback for the built client (dev mode serves the client
// separately via Vite, same split as the root project).
@Controller()
export class AppController {
  @Get('*')
  serveClient(@Res() reply: FastifyReply): void {
    reply.type('text/html').sendFile('index.html', clientDist);
  }
}
