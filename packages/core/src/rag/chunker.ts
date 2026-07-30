/**
 * chunker — a pure, deterministic text chunker with overlap.
 *
 * RAG ingestion splits an extracted document into overlapping windows sized in
 * an approximate token budget, so each chunk embeds into one `voyage-3.5`
 * vector and retrieval returns coherent, self-contained spans (30 §5, 23 §3.4).
 *
 * Pure + synchronous: no I/O, no model calls. Token counts are approximate
 * (chars/4 heuristic) — good enough for budgeting; exact token accounting is a
 * provider concern and never on the hot path.
 */

/** Approx characters per token (English prose heuristic). */
const CHARS_PER_TOKEN = 4;

export interface ChunkOptions {
  /** Target chunk size in approximate tokens. Default 512. */
  maxTokens?: number;
  /** Overlap between consecutive chunks in approximate tokens. Default 64. */
  overlapTokens?: number;
  /**
   * Prefer to break on paragraph/sentence boundaries within a slack window
   * rather than mid-word. Default true.
   */
  respectBoundaries?: boolean;
}

/** A single produced chunk. `index` is 0-based and contiguous. */
export interface TextChunk {
  index: number;
  content: string;
  /** Approximate token count (chars / 4, rounded up). */
  tokenCount: number;
}

const DEFAULTS = { maxTokens: 512, overlapTokens: 64, respectBoundaries: true } as const;

/** Approximate token count for a string (chars/4 heuristic, min 0). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Split `text` into overlapping chunks. Deterministic for a given input +
 * options. Whitespace-only input yields no chunks.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const maxTokens = Math.max(1, options.maxTokens ?? DEFAULTS.maxTokens);
  const overlapTokens = clamp(options.overlapTokens ?? DEFAULTS.overlapTokens, 0, maxTokens - 1);
  const respectBoundaries = options.respectBoundaries ?? DEFAULTS.respectBoundaries;

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) return [];

  const windowChars = maxTokens * CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;
  const stride = Math.max(1, windowChars - overlapChars);

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < normalized.length) {
    const hardEnd = Math.min(start + windowChars, normalized.length);
    const end =
      respectBoundaries && hardEnd < normalized.length
        ? findBoundary(normalized, start, hardEnd)
        : hardEnd;

    const content = normalized.slice(start, end).trim();
    if (content.length > 0) {
      chunks.push({ index, content, tokenCount: estimateTokens(content) });
      index += 1;
    }

    if (end >= normalized.length) break;
    // Advance by stride from the chosen end minus overlap, never going backwards.
    const next = Math.max(start + stride, end - overlapChars);
    start = next <= start ? end : next;
  }

  return chunks;
}

/**
 * Find a "nice" break at or before `hardEnd` (but after `start`): prefer a
 * paragraph break, then a sentence end, then whitespace, within a slack window.
 * Falls back to `hardEnd` when no boundary is found.
 */
function findBoundary(text: string, start: number, hardEnd: number): number {
  const slack = Math.floor((hardEnd - start) * 0.2);
  const floor = Math.max(start + 1, hardEnd - slack);
  const window = text.slice(floor, hardEnd);

  const paragraph = window.lastIndexOf('\n\n');
  if (paragraph >= 0) return floor + paragraph + 2;

  const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('.\n'));
  if (sentence >= 0) return floor + sentence + 1;

  const space = window.lastIndexOf(' ');
  if (space >= 0) return floor + space + 1;

  return hardEnd;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), Math.max(lo, hi));
}
