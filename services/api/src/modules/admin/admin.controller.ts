/**
 * AdminController (Phase 3) — org overview, org settings, and the audit-log
 * query for the team admin console. All routes are org-role-gated via
 * `@RequireRole(...)` (resolved against `:orgId`) after JWT auth; the settings
 * mutation is audited by {@link AuditInterceptor}.
 *
 * Route layout avoids colliding with OrgsModule's `/v1/orgs/:orgId/invites`,
 * `/members`, and (future) `/sso`, `/seats` sub-paths: this controller owns the
 * org root (`GET /v1/orgs/:orgId`), `/settings`, and `/audit-logs` only.
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { AuditLogEntry, OrgSettings, Paginated } from '@cue/types';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  ListAuditLogsQuerySchema,
  UpdateOrgSettingsRequestSchema,
  type ListAuditLogsQueryDto,
  type UpdateOrgSettingsRequestDto,
} from '../../contracts/index.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Audit } from '../audit/audit.decorator.js';
import { AuditInterceptor } from '../audit/audit.interceptor.js';
import { RequireRoleGuard } from '../rbac/rbac.guard.js';
import { RequireRole } from '../rbac/require-role.decorator.js';
import { AdminService } from './admin.service.js';
import type { AdminOrgOverview } from './admin.types.js';

@Controller('v1/orgs/:orgId')
@UseGuards(JwtAuthGuard, RequireRoleGuard)
@UseInterceptors(AuditInterceptor)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @RequireRole('owner', 'admin')
  overview(@Param('orgId') orgId: string): Promise<AdminOrgOverview> {
    return this.admin.getOverview(orgId);
  }

  @Get('settings')
  @RequireRole('owner', 'admin')
  getSettings(@Param('orgId') orgId: string): Promise<OrgSettings> {
    return this.admin.getSettings(orgId);
  }

  @Patch('settings')
  @RequireRole('owner', 'admin')
  @Audit('org.settings.update', { targetType: 'org', targetParam: 'orgId' })
  updateSettings(
    @CurrentUser() ctx: AuthContext,
    @Param('orgId') orgId: string,
    @Body(new ZodValidationPipe(UpdateOrgSettingsRequestSchema)) body: UpdateOrgSettingsRequestDto,
  ): Promise<OrgSettings> {
    return this.admin.updateSettings(ctx, orgId, body);
  }

  @Get('audit-logs')
  @RequireRole('owner', 'admin')
  auditLogs(
    @Param('orgId') orgId: string,
    @Query(new ZodValidationPipe(ListAuditLogsQuerySchema)) query: ListAuditLogsQueryDto,
  ): Promise<Paginated<AuditLogEntry>> {
    return this.admin.listAuditLogs(orgId, query);
  }
}
