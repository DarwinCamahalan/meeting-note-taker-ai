/**
 * Auth contract (OAuth2 PKCE device-code MVP). Zod schemas are the source of
 * truth; the inferred DTOs are asserted equal to @cue/types below.
 */
import { z } from 'zod';
import type {
  AuthTokens,
  PkceExchangeRequest,
  PkceStartRequest,
  PkceStartResponse,
  RefreshRequest,
} from '@cue/types';
import type { Assert, Equal, StripUndef } from './type-utils.js';

export const PkceChallengeMethodSchema = z.literal('S256');

export const PkceStartRequestSchema = z
  .object({
    /** base64url(sha256(code_verifier)); RFC 7636 §4.2 length bounds. */
    code_challenge: z.string().min(43).max(128),
    code_challenge_method: PkceChallengeMethodSchema.optional(),
  })
  .strict();

export const PkceStartResponseSchema = z.object({
  device_code: z.string(),
  verification_uri: z.string().url(),
  interval: z.number().int().positive(),
  expires_in: z.number().int().positive(),
});

export const PkceExchangeRequestSchema = z
  .object({
    device_code: z.string().min(1),
    code_verifier: z.string().min(43).max(128),
  })
  .strict();

export const AuthTokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int().positive(),
});

export const RefreshRequestSchema = z
  .object({
    refresh_token: z.string().min(1),
  })
  .strict();

export type PkceStartRequestDto = z.infer<typeof PkceStartRequestSchema>;
export type PkceStartResponseDto = z.infer<typeof PkceStartResponseSchema>;
export type PkceExchangeRequestDto = z.infer<typeof PkceExchangeRequestSchema>;
export type AuthTokensDto = z.infer<typeof AuthTokensSchema>;
export type RefreshRequestDto = z.infer<typeof RefreshRequestSchema>;

/* ---- drift guards ---- */
export type _PkceStartReq = Assert<
  Equal<StripUndef<PkceStartRequestDto>, StripUndef<PkceStartRequest>>
>;
export type _PkceStartRes = Assert<
  Equal<StripUndef<PkceStartResponseDto>, StripUndef<PkceStartResponse>>
>;
export type _PkceExchangeReq = Assert<
  Equal<StripUndef<PkceExchangeRequestDto>, StripUndef<PkceExchangeRequest>>
>;
export type _AuthTokens = Assert<Equal<StripUndef<AuthTokensDto>, StripUndef<AuthTokens>>>;
export type _RefreshReq = Assert<Equal<StripUndef<RefreshRequestDto>, StripUndef<RefreshRequest>>>;
