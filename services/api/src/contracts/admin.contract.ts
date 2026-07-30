/**
 * Admin / RBAC contract (Phase 3). Zod is the source of truth for the request
 * shapes the OrgsModule / AdminModule validate; the response schemas + drift
 * guards assert structural identity with the @cue/types wire DTOs the SDK
 * imports (no drift). Roles reuse the RBAC subset (owner/admin/member) — the
 * billing-only pseudo-role is not assignable via these endpoints.
 */
import { z } from 'zod';
import type {
  AcceptInviteRequest,
  AdminMemberView,
  AuditLogEntry,
  CreateInviteRequest,
  ListAuditLogsQuery,
  OrgInvite,
  OrgSettings,
  Paginated,
  UpdateMemberRequest,
  UpdateOrgSettingsRequest,
} from '@cue/types';
import type { Assert, Equal, StripUndef } from './type-utils.js';

/** RBAC-assignable roles (excludes the billing-only pseudo-role). */
export const RoleSchema = z.enum(['owner', 'admin', 'member']);
export const InviteStatusSchema = z.enum(['pending', 'accepted', 'revoked', 'expired']);

/* ------------------------------- requests ------------------------------- */

export const CreateInviteRequestSchema = z
  .object({
    email: z.string().email().max(320),
    role: RoleSchema,
  })
  .strict();

export const AcceptInviteRequestSchema = z
  .object({
    token: z.string().min(1).max(512),
  })
  .strict();

export const UpdateMemberRequestSchema = z
  .object({
    role: RoleSchema,
  })
  .strict();

export const UpdateOrgSettingsRequestSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric or hyphen')
      .optional(),
    ssoDomains: z.array(z.string().min(1).max(253)).max(50).optional(),
    allowDomainJoin: z.boolean().optional(),
    defaultMemberRole: RoleSchema.optional(),
  })
  .strict();

export const ListAuditLogsQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    action: z.string().min(1).max(100).optional(),
    actorUserId: z.string().min(1).optional(),
  })
  .strict();

export const ListMembersQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

/* ------------------------------- responses ------------------------------ */

export const OrgInviteSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  email: z.string(),
  role: RoleSchema,
  status: InviteStatusSchema,
  invitedBy: z.string().nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export const AdminMemberViewSchema = z.object({
  userId: z.string(),
  orgId: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  role: RoleSchema,
  joinedAt: z.string(),
  lastActiveAt: z.string().nullable(),
  ssoLinked: z.boolean(),
});

export const OrgSettingsSchema = z.object({
  orgId: z.string(),
  name: z.string(),
  slug: z.string(),
  ssoDomains: z.array(z.string()),
  allowDomainJoin: z.boolean(),
  defaultMemberRole: RoleSchema,
});

export const AuditLogEntrySchema = z.object({
  id: z.string(),
  orgId: z.string(),
  actorUserId: z.string().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
});

export type CreateInviteRequestDto = z.infer<typeof CreateInviteRequestSchema>;
export type AcceptInviteRequestDto = z.infer<typeof AcceptInviteRequestSchema>;
export type UpdateMemberRequestDto = z.infer<typeof UpdateMemberRequestSchema>;
export type UpdateOrgSettingsRequestDto = z.infer<typeof UpdateOrgSettingsRequestSchema>;
export type ListAuditLogsQueryDto = z.infer<typeof ListAuditLogsQuerySchema>;
export type ListMembersQueryDto = z.infer<typeof ListMembersQuerySchema>;

/* -------------------------------- drift guards -------------------------- */
export type _CreateInvite = Assert<
  Equal<StripUndef<CreateInviteRequestDto>, StripUndef<CreateInviteRequest>>
>;
export type _AcceptInvite = Assert<
  Equal<StripUndef<AcceptInviteRequestDto>, StripUndef<AcceptInviteRequest>>
>;
export type _UpdateMember = Assert<
  Equal<StripUndef<UpdateMemberRequestDto>, StripUndef<UpdateMemberRequest>>
>;
export type _UpdateSettings = Assert<
  Equal<StripUndef<UpdateOrgSettingsRequestDto>, StripUndef<UpdateOrgSettingsRequest>>
>;
export type _ListAudit = Assert<
  Equal<StripUndef<ListAuditLogsQueryDto>, StripUndef<ListAuditLogsQuery>>
>;
export type _OrgInvite = Assert<Equal<StripUndef<z.infer<typeof OrgInviteSchema>>, StripUndef<OrgInvite>>>;
export type _MemberView = Assert<
  Equal<StripUndef<z.infer<typeof AdminMemberViewSchema>>, StripUndef<AdminMemberView>>
>;
export type _OrgSettings = Assert<
  Equal<StripUndef<z.infer<typeof OrgSettingsSchema>>, StripUndef<OrgSettings>>
>;
export type _AuditEntry = Assert<
  Equal<StripUndef<z.infer<typeof AuditLogEntrySchema>>, StripUndef<AuditLogEntry>>
>;
export type _PaginatedMembers = Assert<
  Equal<
    StripUndef<z.infer<typeof AdminMemberViewSchema>>[],
    StripUndef<Paginated<AdminMemberView>>['data']
  >
>;
