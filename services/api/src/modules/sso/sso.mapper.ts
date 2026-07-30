/**
 * Row -> wire DTO mappers for the SsoModule. DB rows (Drizzle, @cue/db) are
 * projected to the transport DTOs (@cue/types) here so controllers/services
 * never leak column shapes or `Date` objects across the wire.
 */
import type { Connection } from '@workos-inc/node';
import type { Org as OrgRow, SsoConnection as SsoConnectionRow, User as UserRow } from '@cue/db';
import type { Org, SsoConnection, SsoConnectionStatus, User } from '@cue/types';

/** `sso_connections` row -> {@link SsoConnection} wire DTO. */
export function toSsoConnectionDto(row: SsoConnectionRow): SsoConnection {
  return {
    id: row.id,
    orgId: row.orgId,
    provider: row.provider,
    workosConnectionId: row.workosConnectionId,
    workosOrganizationId: row.workosOrganizationId,
    domain: row.domain,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Map a WorkOS connection lifecycle state onto our {@link SsoConnectionStatus}. */
export function mapWorkosState(state: Connection['state']): SsoConnectionStatus {
  switch (state) {
    case 'active':
      return 'active';
    case 'inactive':
      return 'inactive';
    case 'validating':
      return 'validating';
    case 'draft':
    default:
      return 'draft';
  }
}

/** `users` row -> {@link User} wire DTO, scoped to `orgId`. */
export function toUserDto(row: UserRow, orgId: string): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    dataRegion: row.dataRegion,
    orgId,
    createdAt: row.createdAt.toISOString(),
  };
}

/** `orgs` row -> {@link Org} wire DTO. */
export function toOrgDto(row: OrgRow): Org {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    dataRegion: row.dataRegion,
    isPersonal: row.isPersonal,
    createdAt: row.createdAt.toISOString(),
  };
}
