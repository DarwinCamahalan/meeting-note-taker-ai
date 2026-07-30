/**
 * SsoModule — enterprise SSO/SCIM (WorkOS) alongside the consumer PKCE path.
 *
 * Public login: SsoController (authorize + callback).
 * Admin config: SsoConnectionsController (owner/admin-gated CRUD).
 * Directory sync: ScimController (signature-verified webhook).
 *
 * Imports AuthModule for {@link AuthService} (token minting) and RbacModule for
 * {@link RequireRoleGuard}. DbService + AppConfig are global.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { ScimController } from './scim.controller.js';
import { ScimService } from './scim.service.js';
import { SsoConnectionsController } from './sso-connections.controller.js';
import { SsoController } from './sso.controller.js';
import { SsoProvisioningService } from './sso-provisioning.service.js';
import { SsoService } from './sso.service.js';
import { WorkosService } from './workos.service.js';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [SsoController, SsoConnectionsController, ScimController],
  providers: [SsoService, ScimService, SsoProvisioningService, WorkosService],
  exports: [SsoService, SsoProvisioningService],
})
export class SsoModule {}
