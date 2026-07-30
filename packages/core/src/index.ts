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
