/**
 * SsoService — orchestrates the enterprise SSO flow on top of WorkOS:
 *  - admin connection CRUD, persisted to `sso_connections` (@cue/db);
 *  - the `authorize` entrypoint (resolve org/connection/domain -> WorkOS URL);
 *  - the `callback` code-exchange -> JIT provision -> first-party tokens.
 *
 * The consumer PKCE path (AuthService) is untouched; SSO logins reuse only its
 * additive {@link AuthService.issueTokensForIdentity} to mint the same tokens.
 */
import { Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { orgs, ssoConnections } from '@cue/db';
import type { NewSsoConnection, SsoConnection as SsoConnectionRow } from '@cue/db';
import type {
  SsoAuthorizeResponse,
  SsoCallbackResult,
  SsoConnection as SsoConnectionDto,
} from '@cue/types';
import type { AuthContext } from '../../common/auth-context.js';
import { conflict, notFound, unauthorized } from '../../common/problem-details.js';
import { DbService } from '../../database/db.service.js';
import type {
  CreateSsoConnectionRequestDto,
  SsoAuthorizeQueryDto,
} from '../../contracts/index.js';
import { AuthService } from '../auth/auth.service.js';
import { writeAuditLog } from './sso-audit.js';
import { SsoProvisioningService } from './sso-provisioning.service.js';
import { toOrgDto, toSsoConnectionDto, toUserDto } from './sso.mapper.js';
import { WorkosService } from './workos.service.js';

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);

  constructor(
    private readonly db: DbService,
    private readonly workos: WorkosService,
    private readonly provisioning: SsoProvisioningService,
    private readonly auth: AuthService,
  ) {}

  /* ---------------------------------------------------------------- *
   * Admin connection CRUD
   * ---------------------------------------------------------------- */

  /** `GET /v1/orgs/:orgId/sso/connections` — list the org's SSO connections. */
  async listConnections(orgId: string): Promise<SsoConnectionDto[]> {
    const rows = await this.db.db
      .select()
      .from(ssoConnections)
      .where(eq(ssoConnections.orgId, orgId));
    return rows.map(toSsoConnectionDto);
  }

  /** `POST /v1/orgs/:orgId/sso/connections` — provision a WorkOS connection. */
  async createConnection(
    ctx: AuthContext,
    orgId: string,
    body: CreateSsoConnectionRequestDto,
  ): Promise<SsoConnectionDto> {
    const [org] = await this.db.db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
    if (!org) {
      throw notFound(`Org ${orgId} not found.`);
    }

    const existing = await this.db.db
      .select()
      .from(ssoConnections)
      .where(eq(ssoConnections.domain, body.domain))
      .limit(1);
    if (existing.length > 0) {
      throw conflict(`Domain ${body.domain} already has an SSO connection.`);
    }

    // Reuse a caller-supplied WorkOS Organization, else create one bound to the
    // domain. The WorkOS connection itself is configured out-of-band (admin
    // portal / IdP) and activated later via webhook — so we persist it draft.
    const workosOrganizationId =
      body.workosOrganizationId ?? (await this.workos.ensureOrganization(org.name, body.domain)).id;

    const values: NewSsoConnection = {
      orgId,
      provider: body.provider,
      domain: body.domain,
      workosOrganizationId,
      workosConnectionId: null,
      status: 'draft',
    };
    const [row] = await this.db.db.insert(ssoConnections).values(values).returning();
    if (!row) {
      throw new Error('Failed to persist SSO connection.');
    }

    await writeAuditLog(this.db.db, {
      orgId,
      action: 'sso.connection.create',
      actorUserId: ctx.userId,
      targetType: 'sso_connection',
      targetId: row.id,
      metadata: { provider: body.provider, domain: body.domain, workosOrganizationId },
    });

    return toSsoConnectionDto(row);
  }

  /** `DELETE /v1/orgs/:orgId/sso/connections/:connectionId` — remove a connection. */
  async deleteConnection(ctx: AuthContext, orgId: string, connectionId: string): Promise<void> {
    const row = await this.loadConnection(orgId, connectionId);

    if (row.workosConnectionId) {
      try {
        await this.workos.deleteConnection(row.workosConnectionId);
      } catch (err) {
        // The local row is the source of truth for our routing; log and proceed
        // so a WorkOS-side 404 does not wedge deletion.
        this.logger.warn(`WorkOS deleteConnection failed (continuing): ${errText(err)}`);
      }
    }

    await this.db.db.delete(ssoConnections).where(eq(ssoConnections.id, connectionId));
    await writeAuditLog(this.db.db, {
      orgId,
      action: 'sso.connection.delete',
      actorUserId: ctx.userId,
      targetType: 'sso_connection',
      targetId: connectionId,
      metadata: { domain: row.domain },
    });
  }

  /* ---------------------------------------------------------------- *
   * Login: authorize + callback
   * ---------------------------------------------------------------- */

  /** `GET /v1/sso/authorize` — resolve the WorkOS authorization URL. */
  async authorize(query: SsoAuthorizeQueryDto): Promise<SsoAuthorizeResponse> {
    const redirectUri = query.redirectUri ?? this.workos.redirectUri;
    let organizationId = query.organizationId;
    let connectionId = query.connectionId;

    // A raw email domain is resolved to a stored connection's WorkOS ids.
    if (!organizationId && !connectionId && query.domain) {
      const [row] = await this.db.db
        .select()
        .from(ssoConnections)
        .where(eq(ssoConnections.domain, query.domain))
        .limit(1);
      if (!row) {
        throw notFound(`No SSO connection is configured for domain ${query.domain}.`);
      }
      connectionId = row.workosConnectionId ?? undefined;
      organizationId = row.workosOrganizationId;
    }

    const authorizationUrl = this.workos.getAuthorizationUrl({
      organizationId,
      connectionId,
      redirectUri,
      state: query.state,
    });
    return { authorizationUrl };
  }

  /**
   * `GET /v1/sso/callback` core — exchange the code, JIT-provision the identity
   * into the org that owns the WorkOS connection, and mint first-party tokens.
   */
  async handleCallback(code: string): Promise<SsoCallbackResult> {
    const profile = await this.workos.getProfile(code);
    if (!profile.email) {
      throw unauthorized('SSO profile is missing an email address.');
    }

    const connection = await this.resolveConnectionForProfile(
      profile.connectionId,
      profile.organizationId,
    );

    const provisioned = await this.provisioning.provisionMember({
      orgId: connection.orgId,
      email: profile.email,
      workosSubject: profile.id,
      displayName: fullName(profile.firstName, profile.lastName),
    });

    if (provisioned.membershipCreated) {
      await writeAuditLog(this.db.db, {
        orgId: connection.orgId,
        action: 'scim.user.provision',
        actorUserId: null,
        targetType: 'user',
        targetId: provisioned.user.id,
        metadata: { via: 'sso.callback', email: profile.email },
      });
    }

    const tokens = await this.auth.issueTokensForIdentity({
      userId: provisioned.user.id,
      orgId: provisioned.org.id,
      email: provisioned.user.email,
      region: provisioned.org.dataRegion,
      roles: [provisioned.role],
    });

    return {
      tokens,
      user: toUserDto(provisioned.user, provisioned.org.id),
      org: toOrgDto(provisioned.org),
    };
  }

  /* ---------------------------------------------------------------- *
   * Internals
   * ---------------------------------------------------------------- */

  private async loadConnection(orgId: string, connectionId: string): Promise<SsoConnectionRow> {
    const [row] = await this.db.db
      .select()
      .from(ssoConnections)
      .where(and(eq(ssoConnections.id, connectionId), eq(ssoConnections.orgId, orgId)))
      .limit(1);
    if (!row) {
      throw notFound(`SSO connection ${connectionId} not found for this org.`);
    }
    return row;
  }

  /** Map a WorkOS profile back to the org that owns its connection. */
  private async resolveConnectionForProfile(
    workosConnectionId: string,
    workosOrganizationId: string | undefined,
  ): Promise<SsoConnectionRow> {
    const [byConnection] = await this.db.db
      .select()
      .from(ssoConnections)
      .where(eq(ssoConnections.workosConnectionId, workosConnectionId))
      .limit(1);
    if (byConnection) return byConnection;

    if (workosOrganizationId) {
      const [byOrg] = await this.db.db
        .select()
        .from(ssoConnections)
        .where(eq(ssoConnections.workosOrganizationId, workosOrganizationId))
        .limit(1);
      if (byOrg) return byOrg;
    }

    throw unauthorized('No SSO connection matches this identity provider.');
  }
}

function fullName(first?: string, last?: string): string | null {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : null;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
