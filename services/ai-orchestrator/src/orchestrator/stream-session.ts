/**
 * One StreamSession owns the lifecycle of a single gRPC `Orchestrator.Stream`
 * bidi call: it constructs a `@cue/core` pipeline on StartSession, feeds it
 * audio, forwards its transcript/cue/state callbacks back down the stream, and
 * tears everything down cleanly on stop / half-close / cancel / error.
 */
import type { CuePipeline } from '@cue/core';
import { grpc } from '@cue/proto';
import type {
  AudioChunk as ProtoAudioChunk,
  AudioFormat,
  ClientEnvelope,
  ServerEnvelope,
  StartSession,
} from '@cue/proto';
import { Logger } from '@nestjs/common';
import type { MetricsRegistry } from '@cue/observability';
import type { CueEvent, TranscriptEvent } from '@cue/types';
import type { AdmissionLease } from '../admission/admission-control.service.js';
import {
  toCoreAudioChunk,
  toServerCue,
  toServerState,
  toServerTranscript,
} from './mappers.js';

/**
 * Constructs a fresh, unstarted pipeline for a stream. Receives the
 * StartSession so per-session context (org + document scope for RAG) can be
 * bound into the pipeline before it starts.
 */
export type OrchestratorFactory = (start: StartSession) => CuePipeline;

/** Observability collaborators for the per-stream SLI recorder. */
export interface StreamMetricsContext {
  readonly metrics: MetricsRegistry;
  readonly region: string | undefined;
}

/** The admission seam consulted at session start (70 §6). */
export interface SessionAdmission {
  acquire(): AdmissionLease;
}

/** Static SLI label values for this service (bounded cardinality). */
const STT_PROVIDER = 'deepgram';
const LLM_MODEL = 'claude';
const TIER_UNKNOWN = 'unknown';
/** Discard lag samples above this (ms) as clock skew rather than real lag. */
const MAX_PLAUSIBLE_LAG_MS = 60_000;

export class StreamSession {
  private readonly logger = new Logger(StreamSession.name);
  private pipeline: CuePipeline | undefined;
  private format: AudioFormat | undefined;
  /** Monotonic FINAL-transcript counter (resume offset). */
  private transcriptSeq = 0;
  /** Monotonic DONE-cue counter (resume offset). */
  private cueSeq = 0;
  /** Set once the downstream write side is (being) closed. */
  private closed = false;

  /** Endpointing instant (last FINAL transcript) — the SLO latency start. */
  private lastFinalAt: number | null = null;
  /** Cue id whose first delta latency has already been recorded (dedupe). */
  private ttftRecordedFor: string | null = null;
  /** Per-cue token accounting for the tokens/sec gauge. */
  private cueTokenStart = 0;
  private cueTokenCount = 0;

  /** Admission lease held for this session's lifetime (released on teardown). */
  private lease: AdmissionLease | undefined;

  constructor(
    private readonly call: grpc.ServerDuplexStream<ClientEnvelope, ServerEnvelope>,
    private readonly createPipeline: OrchestratorFactory,
    private readonly obs: StreamMetricsContext,
    private readonly admission?: SessionAdmission,
  ) {}

  /** Route a single inbound client envelope to its handler. */
  handleEnvelope(envelope: ClientEnvelope): void {
    switch (envelope.kind) {
      case 'start':
        void this.handleStart(envelope.start);
        return;
      case 'audio':
        this.handleAudio(envelope.audio);
        return;
      case 'stop':
        void this.stopPipeline();
        return;
      default:
        this.logger.warn('ignoring client envelope with no recognized field');
    }
  }

  /** Client half-closed: finalize the pipeline and end the write side. */
  async finish(): Promise<void> {
    await this.stopPipeline();
    if (!this.closed) {
      this.closed = true;
      this.call.end();
    }
  }

  /** Transport cancel/error: tear down without touching the dead stream. */
  async abort(err?: Error): Promise<void> {
    if (err) this.logger.warn(`stream aborted: ${err.message}`);
    this.closed = true;
    await this.stopPipeline();
  }

  private async handleStart(start: StartSession): Promise<void> {
    if (this.pipeline) {
      this.logger.warn('duplicate StartSession ignored');
      return;
    }
    // Admission (70 §6): always granted an STT lease so the ribbon stays live;
    // the mode may be `transcript-only` under regional overload (cues deferred).
    this.lease = this.admission?.acquire();
    if (this.lease && this.lease.mode !== 'live') {
      this.logger.warn(`session admitted in ${this.lease.mode} mode (regional overload)`);
    }
    this.format = start.format;
    const pipeline = this.createPipeline(start);
    this.pipeline = pipeline;
    pipeline.onState((state) => this.send(toServerState(state)));
    pipeline.onTranscript((event) => {
      this.recordTranscriptSli(event);
      this.send(toServerTranscript(event, this.nextTranscriptSeq(event)));
    });
    pipeline.onCue((event) => {
      this.recordCueSli(event);
      this.send(toServerCue(event, this.nextCueSeq(event)));
    });

    try {
      await pipeline.start();
    } catch (err) {
      this.logger.error(`failed to start pipeline: ${message(err)}`);
      this.send(toServerState('error'));
      void this.finish();
    }
  }

  private handleAudio(audio: ProtoAudioChunk): void {
    const pipeline = this.pipeline;
    if (!pipeline) {
      this.logger.warn('AudioChunk received before StartSession — dropped');
      return;
    }
    pipeline.pushAudio(toCoreAudioChunk(audio, this.format));
  }

  private async stopPipeline(): Promise<void> {
    // Release the admission lease exactly once, even if no pipeline started.
    this.lease?.release();
    this.lease = undefined;
    const pipeline = this.pipeline;
    if (!pipeline) return;
    this.pipeline = undefined;
    try {
      await pipeline.stop();
    } catch (err) {
      this.logger.error(`error stopping pipeline: ${message(err)}`);
    }
  }

  /* --------------------------------- SLIs ---------------------------------- */

  /**
   * STT SLIs. A FINAL transcript marks endpointing — the shared start point for
   * the cue-latency SLOs. A PARTIAL records forwarding lag (STT emit → here).
   * Only timestamps/counts are read; transcript text is never touched.
   */
  private recordTranscriptSli(event: TranscriptEvent): void {
    if (event.kind === 'final') {
      this.lastFinalAt = Date.now();
      this.ttftRecordedFor = null;
      return;
    }
    const lag = Date.now() - event.ts;
    if (lag >= 0 && lag <= MAX_PLAUSIBLE_LAG_MS) {
      this.obs.metrics.sli.sttPartialLagMs.observe({ provider: STT_PROVIDER }, lag);
    }
  }

  /**
   * LLM SLIs. The first `delta` of a cue records time-to-first-token AND the
   * server-controllable cue latency (endpointing → first cue token, the
   * error-budgeted p95<900 slice). `done` publishes the streaming throughput
   * gauge; `error` increments the stream-error counter (drives model fallback).
   */
  private recordCueSli(event: CueEvent): void {
    const { sli } = this.obs.metrics;
    const model = LLM_MODEL;
    switch (event.kind) {
      case 'delta': {
        this.cueTokenCount++;
        if (this.ttftRecordedFor !== event.id && this.lastFinalAt !== null) {
          const latency = Date.now() - this.lastFinalAt;
          this.ttftRecordedFor = event.id;
          this.cueTokenStart = Date.now();
          this.cueTokenCount = 1;
          if (latency >= 0 && latency <= MAX_PLAUSIBLE_LAG_MS) {
            sli.llmTtftMs.observe({ model }, latency);
            sli.cueServerLatencyMs.observe(
              { region: this.obs.region ?? 'unknown', model, tier: TIER_UNKNOWN },
              latency,
            );
          }
        }
        return;
      }
      case 'done': {
        const elapsedS = (Date.now() - this.cueTokenStart) / 1000;
        if (this.cueTokenStart > 0 && elapsedS > 0) {
          sli.llmTokensPerSec.set({ model }, this.cueTokenCount / elapsedS);
        }
        return;
      }
      case 'error':
        sli.llmStreamErrorsTotal.inc({ model });
        return;
      default:
        return;
    }
  }

  private nextTranscriptSeq(event: TranscriptEvent): number {
    return event.kind === 'final' ? ++this.transcriptSeq : this.transcriptSeq;
  }

  private nextCueSeq(event: CueEvent): number {
    return event.kind === 'done' ? ++this.cueSeq : this.cueSeq;
  }

  private send(envelope: ServerEnvelope): void {
    if (this.closed || !this.call.writable) return;
    this.call.write(envelope);
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
