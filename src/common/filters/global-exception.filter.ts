import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { BusinessException } from '../exceptions/business.exception';

/**
 * GlobalExceptionFilter — menstandarkan semua error response ke format wajib.
 * Sesuai 03-backend-guide.md §3: format konsisten di seluruh API.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_ERROR';
    let message = 'Terjadi kesalahan pada server. Silakan coba lagi nanti.';

    if (exception instanceof BusinessException) {
      // Domain-specific business errors
      const exceptionResponse = exception.getResponse() as Record<
        string,
        unknown
      >;
      statusCode = exception.getStatus();
      errorCode = exceptionResponse.errorCode as string;
      message = exceptionResponse.message as string;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;

        // Handle ValidationPipe errors (class-validator)
        if (Array.isArray(resp.message)) {
          errorCode = 'VALIDATION_ERROR';
          message = (resp.message as string[]).join('; ');
        } else if (resp.errorCode) {
          errorCode = resp.errorCode as string;
          message = (resp.message as string) || message;
        } else {
          errorCode = this.httpStatusToErrorCode(statusCode);
          message = (resp.message as string) || message;
        }
      } else {
        errorCode = this.httpStatusToErrorCode(statusCode);
        message =
          typeof exceptionResponse === 'string' ? exceptionResponse : message;
      }
    } else {
      // Unexpected errors — log full stack trace but don't expose to client
      this.logger.error(
        'Unhandled exception',
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json({
      statusCode,
      errorCode,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  private httpStatusToErrorCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_ERROR',
    };
    return map[status] || 'UNKNOWN_ERROR';
  }
}
