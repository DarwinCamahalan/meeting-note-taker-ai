/**
 * @cue/core — the Cue AI pipeline.
 *
 * Public surface: the shared pipeline/context types, the Deepgram STT client,
 * the Claude cue client, the rolling-transcript assembler, the orchestrator
 * that wires them together (+ its `createOrchestrator` factory), and the
 * loopback-capture interface/stub.
 */
export * from './types.js';
export * from './stt/deepgram-client.js';
export * from './llm/claude-cue-client.js';
export * from './orchestrator/context.js';
export * from './orchestrator/cue-orchestrator.js';
export * from './audio/loopback.js';

/* Phase 2 — RAG: embeddings client + pure chunker + DB-agnostic retriever +
   the orchestrator-facing context provider (seam + pure serialization). */
export * from './embeddings/voyage-client.js';
export * from './rag/chunker.js';
export * from './rag/retriever.js';
export * from './rag/context-provider.js';

/* Phase 4 — reliability: graceful-degradation ladder + resilient STT/LLM
   wrappers (circuit breaker + backoff, "degrade never hang", 70 §5). */
export * from './reliability/index.js';
