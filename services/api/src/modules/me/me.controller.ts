import { Controller, Get, UseGuards } from '@nestjs/common';
import type { MeResponse } from '@cue/types';
import { type AuthContext } from '../../common/auth-context.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { MeService } from './me.service.js';

@Controller('v1')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('me')
  getMe(@CurrentUser() ctx: AuthContext): Promise<MeResponse> {
    return this.me.getMe(ctx);
  }
}
