/**
 * Shared domain enum schemas — mirrors of the string unions in
 * @cue/types (and the Drizzle pgEnums). Kept in one place so every
 * request/response schema references the same canonical enum.
 */
import { z } from 'zod';
import type {
  DataRegion,
  DocumentKind,
  DocumentStatus,
  DocumentVisibility,
  OrgRole,
  Plan,
  SessionKind,
  SessionStatus,
  Speaker,
} from '@cue/types';
import type { Assert, Equal } from './type-utils.js';

export const PlanSchema = z.enum(['free', 'pro', 'team', 'enterprise']);
export const DataRegionSchema = z.enum(['us', 'eu']);
export const OrgRoleSchema = z.enum(['owner', 'admin', 'member', 'billing']);
export const SpeakerSchema = z.enum(['them', 'me', 'unknown']);

export const SessionKindSchema = z.enum([
  'interview_prep',
  'interview_live',
  'sales',
  'support',
  'meeting_notes',
]);

export const SessionStatusSchema = z.enum([
  'created',
  'active',
  'ended',
  'processing',
  'failed',
  'purged',
]);

export const DocumentKindSchema = z.enum([
  'resume',
  'job_description',
  'knowledge_base',
  'product_doc',
  'other',
]);

export const DocumentStatusSchema = z.enum([
  'awaiting_upload',
  'uploaded',
  'parsing',
  'embedding',
  'ready',
  'failed',
]);

export const DocumentVisibilitySchema = z.enum(['personal', 'org']);

/* ---- drift guards (enums) ---- */
export type _PlanCheck = Assert<Equal<z.infer<typeof PlanSchema>, Plan>>;
export type _RegionCheck = Assert<Equal<z.infer<typeof DataRegionSchema>, DataRegion>>;
export type _RoleCheck = Assert<Equal<z.infer<typeof OrgRoleSchema>, OrgRole>>;
export type _SpeakerCheck = Assert<Equal<z.infer<typeof SpeakerSchema>, Speaker>>;
export type _KindCheck = Assert<Equal<z.infer<typeof SessionKindSchema>, SessionKind>>;
export type _StatusCheck = Assert<Equal<z.infer<typeof SessionStatusSchema>, SessionStatus>>;
export type _DocKindCheck = Assert<Equal<z.infer<typeof DocumentKindSchema>, DocumentKind>>;
export type _DocStatusCheck = Assert<Equal<z.infer<typeof DocumentStatusSchema>, DocumentStatus>>;
export type _DocVisibilityCheck = Assert<
  Equal<z.infer<typeof DocumentVisibilitySchema>, DocumentVisibility>
>;
