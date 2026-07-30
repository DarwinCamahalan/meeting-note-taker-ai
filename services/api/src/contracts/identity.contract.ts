/**
 * Identity contract: the `GET /v1/me` response (user + active org + roles).
 * Response-only schemas; used for drift guards and (optionally) codegen.
 */
import { z } from 'zod';
import type { MeResponse, Org, User } from '@cue/types';
import { DataRegionSchema, OrgRoleSchema, PlanSchema } from './shared.js';
import type { Assert, Equal, StripUndef } from './type-utils.js';

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  dataRegion: DataRegionSchema,
  orgId: z.string(),
  createdAt: z.string(),
});

export const OrgSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  plan: PlanSchema,
  dataRegion: DataRegionSchema,
  isPersonal: z.boolean(),
  createdAt: z.string(),
});

export const MeResponseSchema = z.object({
  user: UserSchema,
  org: OrgSchema,
  roles: z.array(OrgRoleSchema),
});

export type UserDto = z.infer<typeof UserSchema>;
export type OrgDto = z.infer<typeof OrgSchema>;
export type MeResponseDto = z.infer<typeof MeResponseSchema>;

/* ---- drift guards ---- */
export type _User = Assert<Equal<StripUndef<UserDto>, StripUndef<User>>>;
export type _Org = Assert<Equal<StripUndef<OrgDto>, StripUndef<Org>>>;
export type _Me = Assert<Equal<StripUndef<MeResponseDto>, StripUndef<MeResponse>>>;
