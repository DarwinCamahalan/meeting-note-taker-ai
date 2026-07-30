/**
 * AuditModule — owns the append-only audit trail. Exports {@link AuditService}
 * (imperative writes from services) and {@link AuditInterceptor} (declarative
 * `@Audit(...)` capture) so OrgsModule and AdminModule can record
 * admin-sensitive mutations. DbService is globally provided.
 */
import { Module } from '@nestjs/common';
import { AuditInterceptor } from './audit.interceptor.js';
import { AuditService } from './audit.service.js';

@Module({
  providers: [AuditService, AuditInterceptor],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
