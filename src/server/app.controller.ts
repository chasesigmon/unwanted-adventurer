import path from 'path';
import { fileURLToPath } from 'url';
import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../dist/client');

// SPA fallback for the built client (dev mode serves the client separately
// via Vite). A wildcard Nest route rather than Fastify's own
// setNotFoundHandler — Nest's Fastify adapter already registers its own
// not-found handler during app.listen(), and Fastify only allows one.
// find-my-way (Fastify's router) matches more specific routes/static files
// first regardless of registration order, so this only catches paths
// nothing else claimed.
@Controller()
export class AppController {
  @Get('*')
  serveClient(@Res() reply: FastifyReply): void {
    reply.type('text/html').sendFile('index.html', clientDist);
  }
}
