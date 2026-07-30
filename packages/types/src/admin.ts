/**
 * @cue/types/admin — Phase 3 RBAC + org-admin contract surface shared by the
 * `api` OrgsModule / AdminModule (@RequireRole guard, invites, member + role
 * management, org settings, audit-log queries, seat accounting), the web admin
 * console, and the typed SDK.
 *
 * Roles reuse the `org_role` DB enum via {@link Role} (a strict RBAC subset of
 * the wider {@link OrgRole}); entitlements remain the feature-gate source of
 * truth. Transport-agnostic plain data. Additive: tolerate unknowns.
 */
import type { OrgRole } from './api.js';

/* ------------------------------------------------------------------ *
 * RBAC — roles, permissions, guard metadata
 * ------------------------------------------------------------------ */

/**
 * The RBAC role set the `@RequireRole` guard evaluates over `org_members.role`.
 * A strict subset of {@link OrgRole} (excludes the billing-only pseudo-role);
 * kept assignable to `OrgRole` so guards can compare without casts.
 */
export type Role = Extract<OrgRole, 'owner' | 'admin' | 'member'>;

/**
 * Fine-grained capability a role may hold. Feature code should prefer role
 * checks; permissions exist for endpoints that need sub-role granularity
 * (e.g. members read but only admins manage the shared KB). Additive.
 */
export type Permission =
  | 'org.settings.read'
  | 'org.settings.write'
  | 'members.read'
  | 'members.invite'
  | 'members.update'
  | 'members.remove'
  | 'sso.manage'
  | 'audit.read'
  | 'billing.manage'
  | 'kb.read'
  | 'kb.manage';

/**
 * The requirement attached by `@RequireRole(...)` and read by the RBAC guard via
 * `Reflector`. Any of `roles` satisfies the check; an optional `permission`
 * narrows it further. Defined here so the decorator, guard, and tests share one
 * shape.
 */
export interface RbacRequirement {
  /** The caller's `org_members.role` must be one of these. */
  roles: Role[];
  /** Optional fine-grained capability the role must additionally satisfy. */
  permission?: Permission;
}

/**
 * NestJS metadata key set by the `@RequireRole(...)` decorator and read by the
 * RBAC guard. Mirrors REQUIRE_ENTITLEMENT_METADATA_KEY in `billing.ts`.
 */
export const REQUIRE_ROLE_METADATA_KEY = 'cue:require-role' as const;

/* ------------------------------------------------------------------ *
 * Invitations
 * ------------------------------------------------------------------ */

/** Lifecycle of an org invitation (`invitations.status`). Additive. */
export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

/** API view of an `invitations` row. The raw `token` is never serialized. */
export interface OrgInvite {
  id: string;
  orgId: string;
  email: string;
  /** Role the invitee is granted on accept. */
  role: Role;
  status: InviteStatus;
  /** User id of the admin who issued the invite; null if that user was removed. */
  invitedBy: string | null;
  /** ISO-8601 expiry after which the token no longer accepts. */
  expiresAt: string;
  createdAt: string;
}

/** `POST /v1/orgs/:orgId/invites` request. */
export interface CreateInviteRequest {
  email: string;
  role: Role;
}

/** `POST /v1/invites/accept` request — redeem an invite token as the signed-in user. */
export interface AcceptInviteRequest {
  token: string;
}

/* ------------------------------------------------------------------ *
 * Members (admin view + role management)
 * ------------------------------------------------------------------ */

/**
 * Admin-console view of an org member — the `org_members` row joined to the
 * `users` identity it belongs to. Returned by `GET /v1/orgs/:orgId/members`.
 */
export interface AdminMemberView {
  userId: string;
  orgId: string;
  email: string;
  displayName: string | null;
  role: Role;
  /** ISO-8601 when the member joined the org. */
  joinedAt: string;
  /** ISO-8601 of last activity; null if never active. */
  lastActiveAt: string | null;
  /** True when the member authenticates via an SSO/SCIM connection. */
  ssoLinked: boolean;
}

/** `PATCH /v1/orgs/:orgId/members/:userId` request — change a member's role. */
export interface UpdateMemberRequest {
  role: Role;
}

/* ------------------------------------------------------------------ *
 * Org settings
 * ------------------------------------------------------------------ */

/** `GET/PATCH /v1/orgs/:orgId/settings` view of org-level configuration. */
export interface OrgSettings {
  orgId: string;
  name: string;
  slug: string;
  /** Email domains claimed by the org for SSO routing + JIT provisioning. */
  ssoDomains: string[];
  /** Auto-join verified-email users whose domain matches `ssoDomains`. */
  allowDomainJoin: boolean;
  /** Default role assigned to SCIM/JIT-provisioned members. */
  defaultMemberRole: Role;
}

/** `PATCH /v1/orgs/:orgId/settings` request — partial update of org settings. */
export interface UpdateOrgSettingsRequest {
  name?: string;
  slug?: string;
  ssoDomains?: string[];
  allowDomainJoin?: boolean;
  defaultMemberRole?: Role;
}

/* ------------------------------------------------------------------ *
 * Audit log
 * ------------------------------------------------------------------ */

/**
 * The admin-sensitive actions the audit-log write helper/interceptor records
 * into `audit_logs.action`. Additive: the log tolerates unlisted action strings
 * (hence the `| string` on {@link AuditLogEntry.action}) so legacy/other-domain
 * events (e.g. 'session.start') still read back.
 */
export type AuditAction =
  | 'member.invite'
  | 'member.invite.accept'
  | 'member.role.update'
  | 'member.remove'
  | 'org.settings.update'
  | 'sso.connection.create'
  | 'sso.connection.delete'
  | 'scim.user.provision'
  | 'scim.user.deprovision'
  | 'kb.document.remove'
  | 'billing.seats.update';

/** API view of an `audit_logs` row — `GET /v1/orgs/:orgId/audit-logs`. */
export interface AuditLogEntry {
  id: string;
  orgId: string;
  /** Actor user id; null for system/SCIM-driven events. */
  actorUserId: string | null;
  /** {@link AuditAction} for admin events; free-form string for others. */
  action: AuditAction | string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Query params for `GET /v1/orgs/:orgId/audit-logs`. */
export interface ListAuditLogsQuery {
  cursor?: string;
  /** 1..100, default 20. */
  limit?: number;
  /** Filter to a single action. */
  action?: AuditAction | string;
  /** Filter to a single actor. */
  actorUserId?: string;
}

/* ------------------------------------------------------------------ *
 * Seat accounting (Team per-seat billing)
 * ------------------------------------------------------------------ */

/**
 * `GET /v1/orgs/:orgId/seats` — reconciles the Stripe subscription quantity
 * against active `org_members`. Drives the admin console seat meter and the
 * pre-invite capacity check.
 */
export interface SeatSummary {
  orgId: string;
  /** Seats paid for on the Team Stripe subscription (subscription quantity). */
  purchasedSeats: number;
  /** Active members counting toward seat usage. */
  usedSeats: number;
  /** max(purchased - used, 0). */
  availableSeats: number;
  /** Pending invitations that will each consume a seat on accept. */
  pendingInvites: number;
}
