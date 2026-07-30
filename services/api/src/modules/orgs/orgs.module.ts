/**
 * OrgsModule (Phase 3) — team invitations + member/role management. Imports the
 * auth guard, the shared RBAC guard (`@RequireRole`), and the audit trail so its
 * admin-gated mutations are recorded. Additive to Phases 0-2.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { InviteAcceptController, OrgsController } from './orgs.controller.js';
import { InvitesService } from './invites.service.js';
import { MembersService } from './members.service.js';

@Module({
  imports: [AuthModule, RbacModule, AuditModule],
  controllers: [OrgsController, InviteAcceptController],
  providers: [InvitesService, MembersService],
  exports: [MembersService],
})
export class OrgsModule {}
