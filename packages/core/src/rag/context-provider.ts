/**
 * RagContextProvider — the DB/tenant-agnostic seam the orchestrator uses to
 * fetch grounding context for a live session, plus the pure serialization +
 * trimming helpers that turn retrieved matches into a prompt-ready block.
 *
 * `@cue/core` must not know about Postgres, orgs, or document scoping — the
 * concrete provider (composing the {@link Retriever} with a tenant-bound
 * `VectorSearchPort`) is built in a service (ai-orchestrator / api) and injected
 * via {@link OrchestratorConfig}. Here we keep only the interface + the pure
 * string work that belongs on the (bounded) context-assembly hop (23 §3.4).
 */
import type { RagChunkMatch, RagRetrievalResult } from '@cue/types';

/**
 * A tenant-bound retrieval seam: given a natural-language query (typically the
 * rolling transcript), return org-scoped top-k matches. The caller owns org /
 * documentId scoping, so `@cue/core` never handles tenant identifiers.
 */
export interface RagContextProvider {
  retrieve(query: string): Promise<RagRetrievalResult>;
}

/**
 * Token budget for the session-stable RAG block that goes into the cached
 * system prefix (23 §3.4). Small, fully-relevant docs (resume + JD) fit here.
 */
export const SESSION_RAG_BUDGET = 1_500;

/**
 * Token budget for volatile "hot" chunks merged into the per-cue user turn
 * (large KBs only). Kept small so the non-cached input stays bounded (23 §7).
 */
export const HOT_RAG_BUDGET = 600;

/**
 * Greedily keep the highest-scoring matches that fit `budget` tokens. Pure +
 * deterministic; input is not mutated. Mirrors 23 §3.4 `trimChunks`.
 */
export function trimMatches(
  matches: readonly RagChunkMatch[],
  budget: number,
): RagChunkMatch[] {
  const ranked = [...matches].sort((a, b) => b.score - a.score);
  const out: RagChunkMatch[] = [];
  let used = 0;
  for (const m of ranked) {
    if (used + m.tokenCount > budget) continue;
    out.push(m);
    used += m.tokenCount;
  }
  return out;
}

/**
 * Deterministic, timestamp-free serialization so a frozen block is byte-
 * identical across cues (the prefix-cache invariant, 23 §3.4). Each chunk is
 * rendered as its citation span + doc type header followed by trimmed content.
 */
export function serializeMatches(matches: readonly RagChunkMatch[]): string {
  return matches
    .map((m) => `[${m.sourceSpan} · ${m.docType}]\n${m.content.trim()}`)
    .join('\n\n');
}
