import { Module } from '@nestjs/common';
import { ObservabilityModule } from '@cue/observability/nest';
import { ConfigModule } from './config/config.module.js';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module.js';
import { DbModule } from './database/db.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { BillingWebhooksModule } from './modules/billing-webhooks/billing-webhooks.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { EntitlementsModule } from './modules/entitlements/entitlements.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MeModule } from './modules/me/me.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { OrgsModule } from './modules/orgs/orgs.module.js';
import { SessionsModule } from './modules/sessions/sessions.module.js';
import { SsoModule } from './modules/sso/sso.module.js';
import { UsageModule } from './modules/usage/usage.module.js';

@Module({
  imports: [
    ConfigModule,
    ObservabilityModule.forRoot({ serviceName: 'api' }),
    RateLimitModule,
    DbModule,
    HealthModule,
    AuthModule,
    MeModule,
    SessionsModule,
    DocumentsModule,
    EntitlementsModule,
    BillingModule,
    BillingWebhooksModule,
    UsageModule,
    OrgsModule,
    AdminModule,
    SsoModule,
  ],
})
export class AppModule {}
