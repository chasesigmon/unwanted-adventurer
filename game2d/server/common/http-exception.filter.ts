import { ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

// Normalizes every thrown HttpException into `{ ok: false, error: string }`,
// which the client's auth fetch helper expects — instead of Nest/Fastify's
// default `{ statusCode, message, error }` shape.
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const status = exception.getStatus();
    const response = exception.getResponse();

    const message =
      typeof response === 'string' ? response : (response as { message?: string | string[] }).message;
    const errorText = Array.isArray(message) ? message[0] : (message ?? exception.message);

    reply.status(status).send({ ok: false, error: errorText });
  }
}
