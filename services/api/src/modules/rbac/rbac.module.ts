/**
 * RbacModule — shared role-based access control. Exports
 * {@link RequireRoleGuard} so any module can gate routes with `@RequireRole(...)`
 * (paired with {@link JwtAuthGuard}). DbService is provided globally, so no
 * imports are needed here.
 */
import { Module } from '@nestjs/common';
import { RequireRoleGuard } from './rbac.guard.js';

@Module({
  providers: [RequireRoleGuard],
  exports: [RequireRoleGuard],
})
export class RbacModule {}
