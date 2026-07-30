/**
 * AdminModule (Phase 3) — org overview, settings, and audit-log queries for the
 * team admin console. Imports the auth guard, the shared RBAC guard, and the
 * audit trail. Additive to Phases 0-2.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [AuthModule, RbacModule, AuditModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
