/**
 * Documents contract (Phase 2 — RAG ingest). The upload request, the full
 * {@link Document} response, the upload response, and the paginated list
 * envelope + list query. Zod is the source of truth; drift guards assert
 * structural identity with the @cue/types wire DTOs the SDK imports.
 */
import { z } from 'zod';
import type {
  Document,
  DocumentUploadRequest,
  DocumentUploadResponse,
  Paginated,
} from '@cue/types';
import { DocumentKindSchema, DocumentStatusSchema } from './shared.js';
import type { Assert, Equal, StripUndef } from './type-utils.js';

/** Max inline document size (chars). Larger sources use the presigned flow (TODO). */
const MAX_CONTENT_CHARS = 2_000_000;

export const DocumentUploadRequestSchema = z
  .object({
    kind: DocumentKindSchema,
    title: z.string().min(1).max(300),
    content: z.string().min(1).max(MAX_CONTENT_CHARS),
    mimeType: z.string().min(1).max(255).optional(),
    byteSize: z.number().int().nonnegative().optional(),
  })
  .strict();

export const ListDocumentsQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const DocumentSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  userId: z.string(),
  kind: DocumentKindSchema,
  title: z.string(),
  status: DocumentStatusSchema,
  mimeType: z.string().nullable(),
  byteSize: z.number().int().nullable(),
  chunkCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const DocumentUploadResponseSchema = z.object({
  document: DocumentSchema,
  chunkCount: z.number().int().nonnegative(),
});

export const PaginatedDocumentsSchema = z.object({
  data: z.array(DocumentSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export type DocumentUploadRequestDto = z.infer<typeof DocumentUploadRequestSchema>;
export type ListDocumentsQueryDto = z.infer<typeof ListDocumentsQuerySchema>;
export type DocumentDto = z.infer<typeof DocumentSchema>;
export type DocumentUploadResponseDto = z.infer<typeof DocumentUploadResponseSchema>;
export type PaginatedDocumentsDto = z.infer<typeof PaginatedDocumentsSchema>;

/* ---- drift guards ---- */
export type _UploadReq = Assert<
  Equal<StripUndef<DocumentUploadRequestDto>, StripUndef<DocumentUploadRequest>>
>;
export type _Doc = Assert<Equal<StripUndef<DocumentDto>, StripUndef<Document>>>;
export type _UploadRes = Assert<
  Equal<StripUndef<DocumentUploadResponseDto>, StripUndef<DocumentUploadResponse>>
>;
export type _PaginatedDocuments = Assert<
  Equal<StripUndef<PaginatedDocumentsDto>, StripUndef<Paginated<Document>>>
>;
