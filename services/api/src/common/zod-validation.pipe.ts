/**
 * Zod validation pipe — parses a request part (body/query/param) against a Zod
 * schema and returns the *typed, coerced* value. On failure it throws a
 * VALIDATION_FAILED {@link AppException} carrying per-field errors, which the
 * global filter renders as RFC 9457 problem+json.
 */
import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodError, ZodType } from 'zod';
import { validationFailed } from './problem-details.js';

@Injectable()
export class ZodValidationPipe<TOut> implements PipeTransform<unknown, TOut> {
  constructor(private readonly schema: ZodType<TOut>) {}

  transform(value: unknown): TOut {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw validationFailed(result.error as ZodError);
    }
    return result.data;
  }
}
