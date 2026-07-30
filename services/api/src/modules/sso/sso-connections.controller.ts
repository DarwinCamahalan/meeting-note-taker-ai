/**
 * Admin SSO connection management — `/v1/orgs/:orgId/sso/connections`. Every
 * route is authenticated (JwtAuthGuard) and gated to org owners/admins
 * (RequireRoleGuard + `@RequireRole`). Members cannot read or mutate SSO config.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { SsoConnection } from '@cue/types';
import { type AuthContext } from '../../common/auth-context.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  CreateSsoConnectionRequestSchema,
  type CreateSsoConnectionRequestDto,
} from '../../contracts/index.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequireRole } from '../rbac/require-role.decorator.js';
import { RequireRoleGuard } from '../rbac/rbac.guard.js';
import { SsoService } from './sso.service.js';

@Controller('v1/orgs/:orgId/sso/connections')
@UseGuards(JwtAuthGuard, RequireRoleGuard)
@RequireRole('owner', 'admin')
export class SsoConnectionsController {
  constructor(private readonly sso: SsoService) {}

  @Get()
  list(@Param('orgId') orgId: string): Promise<SsoConnection[]> {
    return this.sso.listConnections(orgId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() ctx: AuthContext,
    @Param('orgId') orgId: string,
    @Body(new ZodValidationPipe(CreateSsoConnectionRequestSchema))
    body: CreateSsoConnectionRequestDto,
  ): Promise<SsoConnection> {
    return this.sso.createConnection(ctx, orgId, body);
  }

  @Delete(':connectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() ctx: AuthContext,
    @Param('orgId') orgId: string,
    @Param('connectionId') connectionId: string,
  ): Promise<void> {
    return this.sso.deleteConnection(ctx, orgId, connectionId);
  }
}
