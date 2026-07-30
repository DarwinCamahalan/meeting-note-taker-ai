/**
 * Global exception filter — renders EVERY error as RFC 9457 problem+json with
 * the `application/problem+json` content type. Maps our {@link AppException}
 * directly, translates Nest `HttpException`s to the closest error code, and
 * treats anything else as INTERNAL (logging the cause, never leaking it).
 */
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { AppErrorCode, ProblemDetails } from '@cue/types';
import type { Request, Response } from 'express';
import { AppException } from './problem-details.js';

const PROBLEM_CONTENT_TYPE = 'application/problem+json';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const requestId = requestIdOf(req);

    const problem = this.toProblem(exception, requestId);

    if (problem.status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} -> ${String(problem.status)} ${problem.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(problem.status).type(PROBLEM_CONTENT_TYPE).json(problem);
  }

  private toProblem(exception: unknown, requestId: string | undefined): ProblemDetails {
    if (exception instanceof AppException) {
      return exception.toProblem(requestId);
    }
    if (exception instanceof HttpException) {
      return new AppException(
        codeForStatus(exception.getStatus()),
        httpExceptionDetail(exception),
      ).toProblem(requestId);
    }
    return new AppException('INTERNAL', 'An unexpected error occurred.').toProblem(requestId);
  }
}

function requestIdOf(req: Request): string | undefined {
  const header = req.headers['x-request-id'];
  if (typeof header === 'string' && header.length > 0) return header;
  if (Array.isArray(header) && header[0]) return header[0];
  return undefined;
}

function codeForStatus(status: number): AppErrorCode {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return 'AUTH_INVALID_TOKEN';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN_ROLE';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'VALIDATION_FAILED';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL' : 'CONFLICT';
  }
}

function httpExceptionDetail(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.map(String).join('; ');
  }
  return exception.message;
}
