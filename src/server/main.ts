import 'reflect-metadata';
import path from 'path';
import { fileURLToPath } from 'url';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyStatic from '@fastify/static';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module.js';
import { WsAdapter } from './ws-adapter.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import type { AppConfig } from './config/configuration.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../dist/client');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  app.useGlobalFilters(new HttpExceptionFilter());

  const configService = app.get<ConfigService<AppConfig, true>>(ConfigService);

  app.enableCors({ origin: configService.get('clientOrigin', { infer: true }) });
  app.useWebSocketAdapter(new WsAdapter(app, configService));

  await app.register(fastifyStatic, {
    root: clientDist,
    wildcard: false,
  });

  const port = configService.get('port', { infer: true });
  await app.listen(port, '0.0.0.0');
  console.log(`[server] listening on http://localhost:${port}`);
}

bootstrap().catch((err: unknown) => {
  console.error('[server] fatal error:', err);
  process.exit(1);
});
