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
import type { CueEvent, TranscriptEvent } from '@cue/types';
import {
  toCoreAudioChunk,
  toServerCue,
  toServerState,
  toServerTranscript,
} from './mappers.js';

/** Constructs a fresh, unstarted pipeline for a stream. */
export type OrchestratorFactory = () => CuePipeline;

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

  constructor(
    private readonly call: grpc.ServerDuplexStream<ClientEnvelope, ServerEnvelope>,
    private readonly createPipeline: OrchestratorFactory,
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
    this.format = start.format;
    const pipeline = this.createPipeline();
    this.pipeline = pipeline;
    pipeline.onState((state) => this.send(toServerState(state)));
    pipeline.onTranscript((event) => this.send(toServerTranscript(event, this.nextTranscriptSeq(event))));
    pipeline.onCue((event) => this.send(toServerCue(event, this.nextCueSeq(event))));

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
    const pipeline = this.pipeline;
    if (!pipeline) return;
    this.pipeline = undefined;
    try {
      await pipeline.stop();
    } catch (err) {
      this.logger.error(`error stopping pipeline: ${message(err)}`);
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
