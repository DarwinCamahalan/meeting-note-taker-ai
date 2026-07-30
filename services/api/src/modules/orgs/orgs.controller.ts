/**
 * OrgsController (Phase 3 — RBAC + team admin). Invitations and member/role
 * management for an org. Every route requires a valid access token; the
 * mutation routes are additionally role-gated by `@RequireRole(...)` (resolved
 * against the `:orgId` path org) and audited via {@link AuditInterceptor}.
 *
 * `POST /v1/invites/accept` is deliberately NOT role-gated — any signed-in user
 * redeems an invite issued to their own email — so it lives on its own
 * controller path without a role guard.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { AdminMemberView, OrgInvite, Paginated } from '@cue/types';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  AcceptInviteRequestSchema,
  CreateInviteRequestSchema,
  ListMembersQuerySchema,
  UpdateMemberRequestSchema,
  type AcceptInviteRequestDto,
  type CreateInviteRequestDto,
  type ListMembersQueryDto,
  type UpdateMemberRequestDto,
} from '../../contracts/index.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Audit } from '../audit/audit.decorator.js';
import { AuditInterceptor } from '../audit/audit.interceptor.js';
import { RequireRoleGuard } from '../rbac/rbac.guard.js';
import { RequireRole } from '../rbac/require-role.decorator.js';
import { InvitesService } from './invites.service.js';
import { MembersService } from './members.service.js';

@Controller('v1/orgs/:orgId')
@UseGuards(JwtAuthGuard, RequireRoleGuard)
@UseInterceptors(AuditInterceptor)
export class OrgsController {
  constructor(
    private readonly invites: InvitesService,
    private readonly members: MembersService,
  ) {}

  /* ------------------------------- invites ------------------------------ */

  @Post('invites')
  @HttpCode(HttpStatus.CREATED)
  @RequireRole('owner', 'admin')
  @Audit('member.invite', { targetType: 'invite', targetResponseField: 'id' })
  createInvite(
    @CurrentUser() ctx: AuthContext,
    @Param('orgId') orgId: string,
    @Body(new ZodValidationPipe(CreateInviteRequestSchema)) body: CreateInviteRequestDto,
  ): Promise<OrgInvite> {
    return this.invites.create(ctx, orgId, body);
  }

  @Get('invites')
  @RequireRole('owner', 'admin')
  listInvites(@Param('orgId') orgId: string): Promise<OrgInvite[]> {
    return this.invites.list(orgId);
  }

  /* ------------------------------- members ------------------------------ */

  @Get('members')
  @RequireRole('owner', 'admin')
  listMembers(
    @Param('orgId') orgId: string,
    @Query(new ZodValidationPipe(ListMembersQuerySchema)) query: ListMembersQueryDto,
  ): Promise<Paginated<AdminMemberView>> {
    return this.members.list(orgId, query);
  }

  @Patch('members/:userId')
  @RequireRole('owner', 'admin')
  @Audit('member.role.update', { targetType: 'user', targetParam: 'userId' })
  updateMember(
    @CurrentUser() ctx: AuthContext,
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(UpdateMemberRequestSchema)) body: UpdateMemberRequestDto,
  ): Promise<AdminMemberView> {
    return this.members.updateRole(ctx, orgId, userId, body);
  }

  @Delete('members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole('owner', 'admin')
  @Audit('member.remove', { targetType: 'user', targetParam: 'userId' })
  removeMember(
    @CurrentUser() ctx: AuthContext,
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.members.remove(ctx, orgId, userId);
  }
}

/**
 * Invite acceptance — separate controller so the route carries no `:orgId`
 * param and no role guard (a signed-in user redeems their own invite token).
 */
@Controller('v1/invites')
@UseGuards(JwtAuthGuard)
export class InviteAcceptController {
  constructor(private readonly invites: InvitesService) {}

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() ctx: AuthContext,
    @Body(new ZodValidationPipe(AcceptInviteRequestSchema)) body: AcceptInviteRequestDto,
  ): Promise<AdminMemberView> {
    return this.invites.accept(ctx, body.token);
  }
}
