/** Auth endpoints (public): the PKCE device-code flow + refresh. */
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { AuthTokens, PkceStartResponse } from '@cue/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  PkceExchangeRequestSchema,
  PkceStartRequestSchema,
  RefreshRequestSchema,
  type PkceExchangeRequestDto,
  type PkceStartRequestDto,
  type RefreshRequestDto,
} from '../../contracts/index.js';
import { AuthService } from './auth.service.js';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('pkce/start')
  @HttpCode(HttpStatus.OK)
  start(
    @Body(new ZodValidationPipe(PkceStartRequestSchema)) body: PkceStartRequestDto,
  ): PkceStartResponse {
    return this.auth.pkceStart(body);
  }

  @Post('pkce/exchange')
  @HttpCode(HttpStatus.OK)
  exchange(
    @Body(new ZodValidationPipe(PkceExchangeRequestSchema)) body: PkceExchangeRequestDto,
  ): Promise<AuthTokens> {
    return this.auth.pkceExchange(body);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body(new ZodValidationPipe(RefreshRequestSchema)) body: RefreshRequestDto,
  ): Promise<AuthTokens> {
    return this.auth.refresh(body);
  }
}
