/**
 * DB row types — Drizzle is the single source of truth (per 30-data-model.md
 * §4). `InferSelectModel` = a read row; `InferInsertModel` = an insert payload.
 * These are re-exported to services + the SDK so no one hand-writes row shapes.
 *
 * The `document_chunks.embedding` vector is stripped from the public DTO — it
 * is never sent to clients.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type {
  auditLogs,
  devices,
  documentChunks,
  documents,
  entitlements,
  invitations,
  orgMembers,
  orgs,
  sessions,
  ssoConnections,
  subscriptions,
  transcriptSegments,
  transcripts,
  usageEvents,
  users,
} from './schema/index.js';

export type Org = InferSelectModel<typeof orgs>;
export type NewOrg = InferInsertModel<typeof orgs>;

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type OrgMember = InferSelectModel<typeof orgMembers>;
export type NewOrgMember = InferInsertModel<typeof orgMembers>;

export type Device = InferSelectModel<typeof devices>;
export type NewDevice = InferInsertModel<typeof devices>;

export type Session = InferSelectModel<typeof sessions>;
export type NewSession = InferInsertModel<typeof sessions>;

export type Transcript = InferSelectModel<typeof transcripts>;
export type NewTranscript = InferInsertModel<typeof transcripts>;

export type TranscriptSegment = InferSelectModel<typeof transcriptSegments>;
export type NewTranscriptSegment = InferInsertModel<typeof transcriptSegments>;

export type Document = InferSelectModel<typeof documents>;
export type NewDocument = InferInsertModel<typeof documents>;

/** The embedding column is intentionally stripped — never sent to clients. */
export type DocumentChunk = Omit<InferSelectModel<typeof documentChunks>, 'embedding'>;
export type NewDocumentChunk = InferInsertModel<typeof documentChunks>;

export type Subscription = InferSelectModel<typeof subscriptions>;
export type NewSubscription = InferInsertModel<typeof subscriptions>;

export type Entitlement = InferSelectModel<typeof entitlements>;
export type NewEntitlement = InferInsertModel<typeof entitlements>;

export type UsageEvent = InferSelectModel<typeof usageEvents>;
export type NewUsageEvent = InferInsertModel<typeof usageEvents>;

export type AuditLog = InferSelectModel<typeof auditLogs>;
export type NewAuditLog = InferInsertModel<typeof auditLogs>;

export type SsoConnection = InferSelectModel<typeof ssoConnections>;
export type NewSsoConnection = InferInsertModel<typeof ssoConnections>;

export type Invitation = InferSelectModel<typeof invitations>;
export type NewInvitation = InferInsertModel<typeof invitations>;
