/**
 * VoyageEmbeddingsClient — Voyage AI `voyage-3.5` embeddings over the REST API.
 *
 * LOCKED (SR-09): `voyage-3.5` @ 1024 dims end-to-end, identical model + vector
 * space for BOTH document and query embeddings so the pgvector cosine index in
 * `document_chunks.embedding` (vector(1024)) is comparable. Changing the model
 * or dims requires a re-embed + reindex migration.
 *
 * Pure transport (fetch); no SDK dependency. Batches inputs to stay within the
 * provider's per-request cap and validates dimensionality on the way out.
 */

/** Voyage `input_type`: asymmetric embeddings for retrieval quality. */
export type VoyageInputType = 'document' | 'query';

/** The locked embedding model + dimensionality (matches document_chunks). */
export const VOYAGE_EMBEDDING_MODEL = 'voyage-3.5' as const;
export const VOYAGE_EMBEDDING_DIMENSIONS = 1024 as const;

/** Default Voyage embeddings endpoint. */
const VOYAGE_ENDPOINT = 'https://api.voyageai.com/v1/embeddings';

/** Provider per-request input cap; batches larger than this are chunked. */
const DEFAULT_MAX_BATCH = 128;

/** Injectable fetch so the client is testable without a live network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface VoyageEmbeddingsOptions {
  /** VOYAGE_API_KEY. Required. */
  apiKey: string;
  /** Override the model id; defaults to the locked `voyage-3.5`. */
  model?: string;
  /** Override the endpoint (e.g. a proxy); defaults to the public API. */
  endpoint?: string;
  /** Max inputs per request; defaults to 128. */
  maxBatchSize?: number;
  /** Injectable fetch (defaults to globalThis.fetch). */
  fetch?: FetchLike;
}

/** Shape of the Voyage `/v1/embeddings` success payload (subset we consume). */
interface VoyageEmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
}

/**
 * Thrown when the embeddings API errors or returns a malformed / wrong-dim
 * payload. Carries the HTTP status when the failure was an HTTP error.
 */
export class VoyageEmbeddingsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'VoyageEmbeddingsError';
  }
}

export class VoyageEmbeddingsClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly maxBatchSize: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: VoyageEmbeddingsOptions) {
    if (!options.apiKey) {
      throw new VoyageEmbeddingsError('VOYAGE_API_KEY is required to construct VoyageEmbeddingsClient.');
    }
    this.apiKey = options.apiKey;
    this.model = options.model ?? VOYAGE_EMBEDDING_MODEL;
    this.endpoint = options.endpoint ?? VOYAGE_ENDPOINT;
    this.maxBatchSize = options.maxBatchSize ?? DEFAULT_MAX_BATCH;

    const f = options.fetch ?? globalThis.fetch;
    if (typeof f !== 'function') {
      throw new VoyageEmbeddingsError('No fetch implementation available; pass options.fetch.');
    }
    this.fetchImpl = f.bind(globalThis);
  }

  /**
   * Embed `texts` and return one 1024-d vector per input, in input order.
   * Inputs are batched transparently; empty input returns an empty array.
   *
   * @param inputType 'document' when embedding corpus chunks; 'query' when
   *   embedding a live query. Must match the vectors you compare against.
   */
  async embed(texts: readonly string[], inputType: VoyageInputType): Promise<number[][]> {
    if (texts.length === 0) return [];

    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.maxBatchSize) {
      const batch = texts.slice(i, i + this.maxBatchSize);
      const vectors = await this.embedBatch(batch, inputType);
      out.push(...vectors);
    }
    return out;
  }

  /** Convenience: embed a single query and return its vector. */
  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embed([text], 'query');
    if (!vector) {
      throw new VoyageEmbeddingsError('Voyage returned no embedding for the query.');
    }
    return vector;
  }

  private async embedBatch(batch: readonly string[], inputType: VoyageInputType): Promise<number[][]> {
    const res = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: batch,
        input_type: inputType,
        output_dimension: VOYAGE_EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) {
      const detail = await safeText(res);
      throw new VoyageEmbeddingsError(
        `Voyage embeddings request failed (${res.status}): ${detail}`,
        res.status,
      );
    }

    const payload = (await res.json()) as VoyageEmbeddingResponse;
    const rows = payload.data;
    if (!Array.isArray(rows) || rows.length !== batch.length) {
      throw new VoyageEmbeddingsError(
        `Voyage returned ${rows?.length ?? 0} embeddings for ${batch.length} inputs.`,
      );
    }

    // Sort by `index` when present (provider may not guarantee order), else keep order.
    const ordered = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return ordered.map((row, i) => {
      const embedding = row.embedding;
      if (!Array.isArray(embedding) || embedding.length !== VOYAGE_EMBEDDING_DIMENSIONS) {
        throw new VoyageEmbeddingsError(
          `Voyage embedding ${i} had ${embedding?.length ?? 0} dims; expected ${VOYAGE_EMBEDDING_DIMENSIONS}.`,
        );
      }
      return embedding;
    });
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}
