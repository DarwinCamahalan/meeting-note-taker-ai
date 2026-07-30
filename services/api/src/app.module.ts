import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
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
