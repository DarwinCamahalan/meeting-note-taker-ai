/**
 * EmbeddingsService — lazily constructs the shared {@link VoyageEmbeddingsClient}
 * (voyage-3.5 @ 1024-d) from {@link AppConfig}. Lazy so the app boots without
 * VOYAGE_API_KEY; the first RAG operation fails fast with a clear error when
 * the key is absent (fail-loud, never silent).
 */
import { Injectable } from '@nestjs/common';
import { VoyageEmbeddingsClient } from '@cue/core';
import { AppConfig } from '../../config/app-config.js';
import { internal } from '../../common/problem-details.js';

@Injectable()
export class EmbeddingsService {
  private cached: VoyageEmbeddingsClient | undefined;

  constructor(private readonly config: AppConfig) {}

  /** The Voyage client, built on first use. Throws INTERNAL if no key configured. */
  get client(): VoyageEmbeddingsClient {
    if (this.cached) return this.cached;
    const apiKey = this.config.voyageApiKey;
    if (!apiKey) {
      throw internal('RAG is not configured: VOYAGE_API_KEY is unset.');
    }
    this.cached = new VoyageEmbeddingsClient({ apiKey });
    return this.cached;
  }
}
