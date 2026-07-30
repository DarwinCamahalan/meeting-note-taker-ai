/**
 * Resource groupings over the {@link HttpClient}. Each method maps 1:1 to an
 * `api` REST endpoint and is fully typed against @cue/types.
 */
import type {
  AcceptInviteRequest,
  AdminMemberView,
  AuditLogEntry,
  AuthTokens,
  CheckoutSessionRequest,
  CheckoutSessionResponse,
  CreateInviteRequest,
  CreateSessionRequest,
  CreateSsoConnectionRequest,
  Document,
  DocumentUploadRequest,
  DocumentUploadResponse,
  EntitlementsResponse,
  ListAuditLogsQuery,
  ListSessionsQuery,
  MeResponse,
  OrgInvite,
  OrgSettings,
  Paginated,
  PkceExchangeRequest,
  PkceStartRequest,
  PkceStartResponse,
  PortalLinkResponse,
  RefreshRequest,
  SeatSummary,
  Session,
  SsoAuthorizeRequest,
  SsoAuthorizeResponse,
  SsoConnection,
  UpdateMemberRequest,
  UpdateOrgSettingsRequest,
  UsageSummary,
  WsTicket,
} from '@cue/types';
import type { HttpClient } from './http-client.js';

export class AuthResource {
  constructor(private readonly http: HttpClient) {}

  /** `POST /v1/auth/pkce/start` — begin the desktop PKCE device flow. */
  pkceStart(body: PkceStartRequest): Promise<PkceStartResponse> {
    return this.http.post<PkceStartResponse>('/v1/auth/pkce/start', { body });
  }

  /** `POST /v1/auth/pkce/exchange` — trade an approved device_code for tokens. */
  pkceExchange(body: PkceExchangeRequest): Promise<AuthTokens> {
    return this.http.post<AuthTokens>('/v1/auth/pkce/exchange', { body, idempotency: true });
  }

  /** `POST /v1/auth/refresh` — rotate the refresh token and mint a new access token. */
  refresh(body: RefreshRequest): Promise<AuthTokens> {
    return this.http.post<AuthTokens>('/v1/auth/refresh', { body, idempotency: true });
  }
}

export class SessionsResource {
  constructor(private readonly http: HttpClient) {}

  /** `POST /v1/sessions` — create a session record before a meeting. */
  create(body: CreateSessionRequest, opts?: { idempotencyKey?: string }): Promise<Session> {
    return this.http.post<Session>('/v1/sessions', {
      body,
      idempotency: true,
      ...(opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
    });
  }

  /** `GET /v1/sessions` — cursor-paginated list of session records. */
  list(query?: ListSessionsQuery): Promise<Paginated<Session>> {
    return this.http.get<Paginated<Session>>('/v1/sessions', {
      query: { cursor: query?.cursor, limit: query?.limit },
    });
  }

  /** `GET /v1/sessions/:id` — read one session record. */
  get(id: string): Promise<Session> {
    return this.http.get<Session>(`/v1/sessions/${encodeURIComponent(id)}`);
  }

  /** `POST /v1/sessions/:id/ws-ticket` — mint a single-use realtime ticket. */
  wsTicket(id: string): Promise<WsTicket> {
    return this.http.post<WsTicket>(`/v1/sessions/${encodeURIComponent(id)}/ws-ticket`, {
      idempotency: true,
    });
  }
}

export class UsersResource {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/me` — the authenticated user, active org, and roles. */
  me(): Promise<MeResponse> {
    return this.http.get<MeResponse>('/v1/me');
  }

  /** `GET /v1/me/entitlements` — the resolved feature-gate snapshot. */
  entitlements(): Promise<EntitlementsResponse> {
    return this.http.get<EntitlementsResponse>('/v1/me/entitlements');
  }
}

export class DocumentsResource {
  constructor(private readonly http: HttpClient) {}

  /** `POST /v1/documents` — upload text; server chunks, embeds, and persists. */
  upload(body: DocumentUploadRequest, opts?: { idempotencyKey?: string }): Promise<DocumentUploadResponse> {
    return this.http.post<DocumentUploadResponse>('/v1/documents', {
      body,
      idempotency: true,
      ...(opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
    });
  }

  /** `GET /v1/documents` — cursor-paginated list of the org's documents. */
  list(query?: { cursor?: string; limit?: number }): Promise<Paginated<Document>> {
    return this.http.get<Paginated<Document>>('/v1/documents', {
      query: { cursor: query?.cursor, limit: query?.limit },
    });
  }

  /** `GET /v1/documents/:id` — read one document record. */
  get(id: string): Promise<Document> {
    return this.http.get<Document>(`/v1/documents/${encodeURIComponent(id)}`);
  }

  /** `GET /v1/orgs/:orgId/documents` — list the org's shared team knowledge base. */
  listOrgKb(orgId: string, query?: { cursor?: string; limit?: number }): Promise<Paginated<Document>> {
    return this.http.get<Paginated<Document>>(
      `/v1/orgs/${encodeURIComponent(orgId)}/documents`,
      { query: { cursor: query?.cursor, limit: query?.limit } },
    );
  }

  /**
   * `DELETE /v1/orgs/:orgId/documents/:documentId` — remove a document from the
   * shared team KB. Owners/admins only.
   */
  removeOrgDoc(orgId: string, documentId: string): Promise<void> {
    return this.http.delete<void>(
      `/v1/orgs/${encodeURIComponent(orgId)}/documents/${encodeURIComponent(documentId)}`,
    );
  }
}

export class BillingResource {
  constructor(private readonly http: HttpClient) {}

  /** `POST /v1/billing/checkout` — start a Stripe Checkout session. */
  createCheckout(body: CheckoutSessionRequest): Promise<CheckoutSessionResponse> {
    return this.http.post<CheckoutSessionResponse>('/v1/billing/checkout', { body, idempotency: true });
  }

  /** `POST /v1/billing/portal` — mint a Stripe Customer Portal link. */
  portalLink(): Promise<PortalLinkResponse> {
    return this.http.post<PortalLinkResponse>('/v1/billing/portal', { idempotency: true });
  }

  /** `GET /v1/me/entitlements` — the resolved feature-gate snapshot. */
  getEntitlements(): Promise<EntitlementsResponse> {
    return this.http.get<EntitlementsResponse>('/v1/me/entitlements');
  }

  /** `GET /v1/billing/usage` — the current period's live-minute usage summary. */
  usageSummary(): Promise<UsageSummary> {
    return this.http.get<UsageSummary>('/v1/billing/usage');
  }
}

export class SsoResource {
  constructor(private readonly http: HttpClient) {}

  /** `GET /v1/sso/authorize` — resolve a WorkOS authorization URL for an org/domain. */
  authorize(query: SsoAuthorizeRequest): Promise<SsoAuthorizeResponse> {
    return this.http.get<SsoAuthorizeResponse>('/v1/sso/authorize', {
      query: {
        organizationId: query.organizationId,
        connectionId: query.connectionId,
        domain: query.domain,
        redirectUri: query.redirectUri,
        state: query.state,
      },
    });
  }

  /** `GET /v1/orgs/:orgId/sso/connections` — list the org's SSO connections. */
  listConnections(orgId: string): Promise<SsoConnection[]> {
    return this.http.get<SsoConnection[]>(
      `/v1/orgs/${encodeURIComponent(orgId)}/sso/connections`,
    );
  }

  /** `POST /v1/orgs/:orgId/sso/connections` — provision a WorkOS connection. */
  createConnection(orgId: string, body: CreateSsoConnectionRequest): Promise<SsoConnection> {
    return this.http.post<SsoConnection>(
      `/v1/orgs/${encodeURIComponent(orgId)}/sso/connections`,
      { body, idempotency: true },
    );
  }

  /** `DELETE /v1/orgs/:orgId/sso/connections/:connectionId` — remove a connection. */
  deleteConnection(orgId: string, connectionId: string): Promise<void> {
    return this.http.delete<void>(
      `/v1/orgs/${encodeURIComponent(orgId)}/sso/connections/${encodeURIComponent(connectionId)}`,
    );
  }
}

export class AdminResource {
  constructor(private readonly http: HttpClient) {}

  /** `POST /v1/orgs/:orgId/invites` — invite a user to the org with a role. */
  createInvite(orgId: string, body: CreateInviteRequest): Promise<OrgInvite> {
    return this.http.post<OrgInvite>(`/v1/orgs/${encodeURIComponent(orgId)}/invites`, {
      body,
      idempotency: true,
    });
  }

  /** `GET /v1/orgs/:orgId/invites` — list the org's invitations. */
  listInvites(orgId: string): Promise<OrgInvite[]> {
    return this.http.get<OrgInvite[]>(`/v1/orgs/${encodeURIComponent(orgId)}/invites`);
  }

  /** `POST /v1/invites/accept` — redeem an invite token as the signed-in user. */
  acceptInvite(body: AcceptInviteRequest): Promise<AdminMemberView> {
    return this.http.post<AdminMemberView>('/v1/invites/accept', { body, idempotency: true });
  }

  /** `GET /v1/orgs/:orgId/members` — cursor-paginated admin member list. */
  listMembers(orgId: string, query?: { cursor?: string; limit?: number }): Promise<Paginated<AdminMemberView>> {
    return this.http.get<Paginated<AdminMemberView>>(
      `/v1/orgs/${encodeURIComponent(orgId)}/members`,
      { query: { cursor: query?.cursor, limit: query?.limit } },
    );
  }

  /** `PATCH /v1/orgs/:orgId/members/:userId` — change a member's role. */
  updateMember(orgId: string, userId: string, body: UpdateMemberRequest): Promise<AdminMemberView> {
    return this.http.patch<AdminMemberView>(
      `/v1/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`,
      { body },
    );
  }

  /** `DELETE /v1/orgs/:orgId/members/:userId` — remove a member from the org. */
  removeMember(orgId: string, userId: string): Promise<void> {
    return this.http.delete<void>(
      `/v1/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`,
    );
  }

  /** `GET /v1/orgs/:orgId/audit-logs` — cursor-paginated audit trail. */
  auditLogs(orgId: string, query?: ListAuditLogsQuery): Promise<Paginated<AuditLogEntry>> {
    return this.http.get<Paginated<AuditLogEntry>>(
      `/v1/orgs/${encodeURIComponent(orgId)}/audit-logs`,
      {
        query: {
          cursor: query?.cursor,
          limit: query?.limit,
          action: query?.action,
          actorUserId: query?.actorUserId,
        },
      },
    );
  }

  /** `GET /v1/orgs/:orgId/settings` — read org-level settings. */
  getOrgSettings(orgId: string): Promise<OrgSettings> {
    return this.http.get<OrgSettings>(`/v1/orgs/${encodeURIComponent(orgId)}/settings`);
  }

  /** `PATCH /v1/orgs/:orgId/settings` — partial update of org settings. */
  updateOrgSettings(orgId: string, body: UpdateOrgSettingsRequest): Promise<OrgSettings> {
    return this.http.patch<OrgSettings>(`/v1/orgs/${encodeURIComponent(orgId)}/settings`, { body });
  }

  /** `GET /v1/orgs/:orgId/seats` — Team seat usage vs. purchased quantity. */
  seats(orgId: string): Promise<SeatSummary> {
    return this.http.get<SeatSummary>(`/v1/orgs/${encodeURIComponent(orgId)}/seats`);
  }
}
