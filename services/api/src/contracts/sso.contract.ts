/**
 * SSO / SCIM contract (Phase 3 — WorkOS). Zod schemas are the source of truth
 * for the SsoModule's request shapes; the inferred DTOs are asserted equal to
 * their @cue/types counterparts below so the SDK and api never drift.
 */
import { z } from 'zod';
import type { CreateSsoConnectionRequest, SsoAuthorizeRequest } from '@cue/types';
import type { Assert, Equal, StripUndef } from './type-utils.js';

/** Identity-federation protocol backing an org's SSO connection. */
export const SsoProviderSchema = z.enum(['saml', 'oidc', 'authkit']);

/**
 * `GET /v1/sso/authorize` query. Exactly one of
 * `organizationId`/`connectionId`/`domain` routes the user to the right IdP;
 * the refinement rejects a query that names none of them.
 */
export const SsoAuthorizeQuerySchema = z
  .object({
    organizationId: z.string().min(1).optional(),
    connectionId: z.string().min(1).optional(),
    domain: z.string().min(1).optional(),
    redirectUri: z.string().url().optional(),
    state: z.string().min(1).optional(),
  })
  .strict()
  .refine((q) => Boolean(q.organizationId ?? q.connectionId ?? q.domain), {
    message: 'One of organizationId, connectionId, or domain is required.',
    path: ['domain'],
  });

/** `POST /v1/orgs/:orgId/sso/connections` request. */
export const CreateSsoConnectionRequestSchema = z
  .object({
    provider: SsoProviderSchema,
    domain: z.string().min(1),
    workosOrganizationId: z.string().min(1).optional(),
  })
  .strict();

/** `GET /v1/sso/callback` query as WorkOS delivers it. Server-only (no SDK). */
export const SsoCallbackQuerySchema = z
  .object({
    code: z.string().min(1).optional(),
    state: z.string().optional(),
    error: z.string().optional(),
    error_description: z.string().optional(),
  })
  .passthrough();

export type SsoAuthorizeQueryDto = z.infer<typeof SsoAuthorizeQuerySchema>;
export type CreateSsoConnectionRequestDto = z.infer<typeof CreateSsoConnectionRequestSchema>;
export type SsoCallbackQueryDto = z.infer<typeof SsoCallbackQuerySchema>;

/* ---- drift guards ---- */
export type _SsoAuthorizeReq = Assert<
  Equal<StripUndef<SsoAuthorizeQueryDto>, StripUndef<SsoAuthorizeRequest>>
>;
export type _CreateSsoConnReq = Assert<
  Equal<StripUndef<CreateSsoConnectionRequestDto>, StripUndef<CreateSsoConnectionRequest>>
>;
