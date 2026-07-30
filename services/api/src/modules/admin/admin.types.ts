/**
 * Admin-console response shapes that have no cross-boundary @cue/types DTO
 * (server-only reads consumed by the web console via the SDK's generic GET).
 * The org overview aggregates identity, plan, and light membership counts
 * alongside the resolved {@link OrgSettings}.
 */
import type { DataRegion, OrgSettings, Plan } from '@cue/types';

/** `GET /v1/orgs/:orgId` — an org's admin overview + its settings. */
export interface AdminOrgOverview {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  dataRegion: DataRegion;
  isPersonal: boolean;
  /** Active members counting toward the org. */
  memberCount: number;
  /** Pending (not yet accepted) invitations. */
  pendingInvites: number;
  settings: OrgSettings;
  createdAt: string;
}
