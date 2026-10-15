import { randomUUID } from 'node:crypto';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = typeof request.headers['x-request-id'] === 'string' &&
      /^[A-Za-z0-9_-]{8,72}$/.test(request.headers['x-request-id'])
        ? request.headers['x-request-id']
        : randomUUID();
    const code = status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_REJECTED';
    response.setHeader('X-Request-Id', requestId);
    response.status(status).json({
      error: {
        code,
        message: status >= 500 ? 'A service error occurred' : 'Request could not be completed',
        requestId
      }
    });
    // No patient data, raw error messages, URLs, or request bodies are logged.
  }
}
