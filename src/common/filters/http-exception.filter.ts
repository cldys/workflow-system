import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;

    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException
      ? exception.getResponse()
      : undefined;

    const body =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>)
        : undefined;

    const rawMessage =
      body?.message ??
      (typeof exceptionResponse === 'string' ? exceptionResponse : undefined);

    const code =
      statusCode >= 500
        ? 'INTERNAL_SERVER_ERROR'
        : typeof body?.code === 'string'
          ? body.code
          : Array.isArray(rawMessage)
            ? 'VALIDATION_FAILED'
            : this.defaultCode(statusCode);

    const message =
      statusCode >= 500
        ? '服务器内部错误'
        : Array.isArray(rawMessage)
          ? rawMessage.join('；')
          : typeof rawMessage === 'string'
            ? rawMessage
            : '请求处理失败';

    if (statusCode >= 500) {
      const detail =
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : String(exception);

      this.logger.error(detail);
    }

    response.status(statusCode).json({
      statusCode,
      code,
      message,
      path: request.path,
    });
  }

  private defaultCode(statusCode: number): string {
    switch (statusCode) {
      case 400:
        return 'BAD_REQUEST';
      case 404:
        return 'RESOURCE_NOT_FOUND';
      case 409:
        return 'CONFLICT';
      default:
        return 'HTTP_ERROR';
    }
  }
}
