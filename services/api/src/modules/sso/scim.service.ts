/**
 * ScimService — verifies + dispatches WorkOS Directory Sync (SCIM) webhooks,
 * provisioning/deprovisioning `org_members` idempotently.
 *
 * Signature-verified against WORKOS_WEBHOOK_SECRET (the WorkOS SDK recomputes
 * the HMAC from the parsed payload). Delivery is at-least-once, so every branch
 * is idempotent — a replayed event converges to the same membership state. The
 * WorkOS org id on each event maps to our org via `sso_connections`; events for
 * an unmapped org are acknowledged and ignored (never 5xx, so WorkOS stops
 * retrying a directory we don't own).
 */
import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ssoConnections } from '@cue/db';
import type { DirectoryUser, Event } from '@workos-inc/node';
import { DbService } from '../../database/db.service.js';
import { writeAuditLog } from './sso-audit.js';
import { SsoProvisioningService } from './sso-provisioning.service.js';
import { WorkosService } from './workos.service.js';

/** Discriminated outcome of processing one webhook delivery. */
export type ScimResult = { ok: true } | { ok: false; error: string };

@Injectable()
export class ScimService {
  private readonly logger = new Logger(ScimService.name);

  constructor(
    private readonly db: DbService,
    private readonly workos: WorkosService,
    private readonly provisioning: SsoProvisioningService,
  ) {}

  /** Verify the signature, then dispatch the directory-sync event. */
  async process(payload: unknown, sigHeader: string): Promise<ScimResult> {
    let event: Event;
    try {
      event = await this.workos.constructWebhookEvent(payload, sigHeader);
    } catch (err) {
      this.logger.warn(`Rejected SCIM webhook (signature/verify failed): ${errText(err)}`);
      return { ok: false, error: 'invalid signature' };
    }

    try {
      await this.dispatch(event);
    } catch (err) {
      // A valid-signature event that failed to apply: ack so WorkOS does not
      // hammer retries on a persistent bug, but log loudly for alerting.
      this.logger.error(`SCIM dispatch failed for ${event.event} (${event.id})`, err as Error);
    }
    return { ok: true };
  }

  /** Route a verified event to provision/deprovision. Unlisted events ack + noop. */
  private async dispatch(event: Event): Promise<void> {
    switch (event.event) {
      case 'dsync.user.created':
      case 'dsync.user.updated':
        await this.provision(event.data);
        return;
      case 'dsync.user.deleted':
        await this.deprovision(event.data);
        return;
      case 'dsync.group.user_added':
        await this.provision(event.data.user);
        return;
      case 'dsync.group.user_removed':
        await this.deprovision(event.data.user);
        return;
      default:
        this.logger.debug(`Ignoring unhandled directory-sync event: ${event.event}`);
    }
  }

  private async provision(user: DirectoryUser): Promise<void> {
    const orgId = await this.resolveOrgId(user.organizationId);
    const email = primaryEmail(user);
    if (!orgId || !email) {
      this.logger.debug(`SCIM provision skipped (org=${String(orgId)}, email=${String(email)}).`);
      return;
    }
    if (user.state !== 'active') {
      // A provisioned-but-suspended directory user maps to deprovisioning.
      await this.deprovisionResolved(orgId, email, user.id);
      return;
    }

    const result = await this.provisioning.provisionMember({
      orgId,
      email,
      workosSubject: user.idpId || user.id,
      displayName: fullName(user.firstName, user.lastName),
    });
    if (result.membershipCreated) {
      await writeAuditLog(this.db.db, {
        orgId,
        action: 'scim.user.provision',
        actorUserId: null,
        targetType: 'user',
        targetId: result.user.id,
        metadata: { via: 'scim', directoryUserId: user.id, email },
      });
    }
  }

  private async deprovision(user: DirectoryUser): Promise<void> {
    const orgId = await this.resolveOrgId(user.organizationId);
    const email = primaryEmail(user);
    if (!orgId || !email) {
      this.logger.debug(`SCIM deprovision skipped (org=${String(orgId)}).`);
      return;
    }
    await this.deprovisionResolved(orgId, email, user.id);
  }

  private async deprovisionResolved(
    orgId: string,
    email: string,
    directoryUserId: string,
  ): Promise<void> {
    const removedUserId = await this.provisioning.deprovisionMember(orgId, email);
    if (removedUserId) {
      await writeAuditLog(this.db.db, {
        orgId,
        action: 'scim.user.deprovision',
        actorUserId: null,
        targetType: 'user',
        targetId: removedUserId,
        metadata: { via: 'scim', directoryUserId, email },
      });
    }
  }

  /** Map a WorkOS Organization id to our org via `sso_connections`. */
  private async resolveOrgId(workosOrganizationId: string | null): Promise<string | undefined> {
    if (!workosOrganizationId) return undefined;
    const [row] = await this.db.db
      .select({ orgId: ssoConnections.orgId })
      .from(ssoConnections)
      .where(eq(ssoConnections.workosOrganizationId, workosOrganizationId))
      .limit(1);
    return row?.orgId;
  }
}

/** Prefer the top-level email, else the primary/first entry in `emails`. */
function primaryEmail(user: DirectoryUser): string | undefined {
  if (user.email) return user.email;
  const primary = user.emails.find((e) => e.primary) ?? user.emails[0];
  return primary?.value;
}

function fullName(first: string | null, last: string | null): string | null {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : null;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
