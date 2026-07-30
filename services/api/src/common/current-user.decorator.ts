/** `@CurrentUser()` — injects the verified {@link AuthContext} into a handler. */
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthContext, AuthedRequest } from './auth-context.js';
import { unauthorized } from './problem-details.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.authContext) {
      throw unauthorized('Not authenticated.');
    }
    return req.authContext;
  },
);
