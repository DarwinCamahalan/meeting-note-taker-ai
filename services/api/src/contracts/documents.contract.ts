/**
 * Documents contract (stubbed in MVP): the CueDocument response and its
 * paginated list envelope. Ingestion/embedding lands in a later phase.
 */
import { z } from 'zod';
import type { CueDocument, Paginated } from '@cue/types';
import { DocumentKindSchema, DocumentStatusSchema } from './shared.js';
import type { Assert, Equal, StripUndef } from './type-utils.js';

export const CueDocumentSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  kind: DocumentKindSchema,
  title: z.string(),
  status: DocumentStatusSchema,
  createdAt: z.string(),
});

export const PaginatedDocumentsSchema = z.object({
  data: z.array(CueDocumentSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export type CueDocumentDto = z.infer<typeof CueDocumentSchema>;
export type PaginatedDocumentsDto = z.infer<typeof PaginatedDocumentsSchema>;

/* ---- drift guards ---- */
export type _Doc = Assert<Equal<StripUndef<CueDocumentDto>, StripUndef<CueDocument>>>;
export type _PaginatedDocuments = Assert<
  Equal<StripUndef<PaginatedDocumentsDto>, StripUndef<Paginated<CueDocument>>>
>;
