/**
 * Sessions contract: create/list request schemas, the Session response, the
 * paginated list envelope, and the ws-ticket response.
 */
import { z } from 'zod';
import type {
  CreateSessionRequest,
  ListSessionsQuery,
  Paginated,
  Session,
  WsTicket,
} from '@cue/types';
import { SessionKindSchema, SessionStatusSchema } from './shared.js';
import type { Assert, Equal, StripUndef } from './type-utils.js';

export const CreateSessionRequestSchema = z
  .object({
    kind: SessionKindSchema,
    title: z.string().min(1).max(200).optional(),
    disclosed: z.boolean().optional(),
    /** Ids are opaque strings (uuidv7) — do NOT use z.uuid(), it rejects v7. */
    documentIds: z.array(z.string().min(1)).optional(),
    /** ISO-639-1. */
    language: z.string().min(2).max(8).optional(),
  })
  .strict();

export const ListSessionsQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const SessionSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  userId: z.string(),
  kind: SessionKindSchema,
  title: z.string().nullable(),
  disclosed: z.boolean(),
  status: SessionStatusSchema,
  language: z.string(),
  documentIds: z.array(z.string()),
  durationSeconds: z.number().int().nonnegative(),
  createdAt: z.string(),
});

export const PaginatedSessionsSchema = z.object({
  data: z.array(SessionSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const WsTicketSchema = z.object({
  ticket: z.string(),
  wsUrl: z.string(),
  protocol: z.literal('cue.v1'),
  expiresAt: z.string(),
});

export type CreateSessionRequestDto = z.infer<typeof CreateSessionRequestSchema>;
export type ListSessionsQueryDto = z.infer<typeof ListSessionsQuerySchema>;
export type SessionDto = z.infer<typeof SessionSchema>;
export type PaginatedSessionsDto = z.infer<typeof PaginatedSessionsSchema>;
export type WsTicketDto = z.infer<typeof WsTicketSchema>;

/* ---- drift guards ---- */
export type _CreateReq = Assert<
  Equal<StripUndef<CreateSessionRequestDto>, StripUndef<CreateSessionRequest>>
>;
export type _ListQuery = Assert<
  Equal<StripUndef<ListSessionsQueryDto>, StripUndef<ListSessionsQuery>>
>;
export type _Session = Assert<Equal<StripUndef<SessionDto>, StripUndef<Session>>>;
export type _PaginatedSessions = Assert<
  Equal<StripUndef<PaginatedSessionsDto>, StripUndef<Paginated<Session>>>
>;
export type _WsTicket = Assert<Equal<StripUndef<WsTicketDto>, StripUndef<WsTicket>>>;
