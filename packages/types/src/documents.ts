/**
 * @cue/types/documents — RAG document + chunk + retrieval DTOs shared by `api`
 * (DocumentsModule: upload -> chunk -> embed -> persist), `ai-orchestrator`
 * (context assembly / retrieval injection per 23-prompt-context-spec.md), and
 * the typed SDK.
 *
 * Reuses the {@link DocumentKind} / {@link DocumentStatus} enums and the
 * Phase-1 {@link CueDocument} summary from ./api.js — this module is the richer
 * Phase-2 surface layered on top, and must not diverge those enums.
 */
import type { DocumentKind, DocumentStatus, DocumentVisibility } from './api.js';

/* ------------------------------------------------------------------ *
 * Documents
 * ------------------------------------------------------------------ */

/**
 * Full API view of a `documents` row (30-data-model.md §3.4). The raw storage
 * key is intentionally NOT on the wire surface; clients reference documents by
 * id only.
 */
export interface Document {
  id: string;
  orgId: string;
  userId: string;
  kind: DocumentKind;
  title: string;
  status: DocumentStatus;
  /**
   * Team-KB scope: `org` = shared with the whole org (default), `personal` =
   * only the uploading `userId` can list/retrieve it.
   */
  visibility: DocumentVisibility;
  /** MIME type of the source file, when known. */
  mimeType: string | null;
  /** Source byte size, when known. */
  byteSize: number | null;
  /** Number of persisted chunks (0 until embedding completes). */
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * `POST /v1/documents` request. Phase-2 v1 accepts inline extracted text
 * (`content`) which `api` chunks + embeds synchronously; a presigned
 * object-upload flow lands later (documents.storageKey / 30 §3.4).
 */
export interface DocumentUploadRequest {
  kind: DocumentKind;
  title: string;
  /** Pre-extracted UTF-8 text to chunk + embed. */
  content: string;
  /**
   * Team-KB scope for the upload. Defaults to `org` (shared with the whole
   * team) when omitted; pass `personal` for an individual, private upload.
   */
  visibility?: DocumentVisibility;
  /** MIME type of the original source, for provenance. */
  mimeType?: string;
  /** Original source byte size, for quota accounting. */
  byteSize?: number;
}

/** `POST /v1/documents` response — the persisted document and its chunk count. */
export interface DocumentUploadResponse {
  document: Document;
  /** Number of chunks created + embedded. */
  chunkCount: number;
}

/**
 * API view of a `document_chunks` row. The 1024-d embedding vector is NEVER
 * serialized to clients; only text + metadata cross the wire.
 */
export interface DocumentChunk {
  id: string;
  documentId: string;
  orgId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * RAG retrieval (pgvector cosine top-k) — consumed by ai-orchestrator (23 §3.4)
 * ------------------------------------------------------------------ */

/**
 * A single retrieved chunk, already scored and tenant-checked by the retrieval
 * layer. Mirrors 23-prompt-context-spec.md §3.1 `RetrievedChunk` so the
 * orchestrator's context assembler consumes this shape directly.
 */
export interface RagChunkMatch {
  chunkId: string;
  documentId: string;
  /** Document kind of the source, for citation/audit + template routing. */
  docType: DocumentKind;
  /** Human/audit citation span, e.g. "resume#chunk[2]". */
  sourceSpan: string;
  content: string;
  /** Cosine similarity in 0..1 (1 - cosine distance). */
  score: number;
  tokenCount: number;
}

/**
 * The org-scoped top-k retrieval result for a query. Returned by the `@cue/core`
 * Retriever and injected into the Claude prompt prefix / user turn (23 §3.2).
 */
export interface RagRetrievalResult {
  /** The natural-language query the matches were retrieved for. */
  query: string;
  /** Matches, highest cosine similarity first. */
  matches: RagChunkMatch[];
}
