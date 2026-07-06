import { ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

// Normalizes every thrown HttpException (BadRequestException from our
// ZodValidationPipe, UnauthorizedException, ConflictException, ...) into
// this project's existing `{ ok: false, error: string }` response shape,
// which the client (NetworkManager.ts) already expects — instead of
// Nest/Fastify's default `{ statusCode, message, error }` shape.
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
