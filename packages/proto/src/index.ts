/**
 * @cue/proto — the gRPC contract for the ws-gateway <-> ai-orchestrator hop.
 *
 * Ships the `.proto`, a proto-loader that produces predictable JS shapes
 * (camelCase fields, string enums, number longs, virtual oneof discriminators),
 * TS mirrors of every message, and typed client/server helpers so neither
 * service hand-writes gRPC plumbing.
 */
import { fileURLToPath } from 'node:url';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

/** Absolute path to the shipped orchestrator.proto (next to this module). */
export const PROTO_PATH = fileURLToPath(new URL('./orchestrator.proto', import.meta.url));

/** Loader options that pin the JS representation the TS mirrors below assume. */
export const PROTO_LOADER_OPTIONS: protoLoader.Options = {
  keepCase: false, // camelCase field names
  longs: Number, // int64 (ms timestamps) as JS numbers — safe for epoch-ms
  enums: String, // enum fields as their proto value name (e.g. 'FINAL')
  defaults: true,
  oneofs: true, // adds a virtual discriminator field named after the oneof
};

/* ------------------------------------------------------------------ *
 * TS mirrors of the proto messages (see orchestrator.proto)
 * ------------------------------------------------------------------ */

export type Codec = 'CODEC_UNSPECIFIED' | 'OPUS' | 'PCM16';
export type Channel = 'CHANNEL_UNSPECIFIED' | 'MIXED' | 'MIC' | 'LOOPBACK';
export type SessionMode =
  | 'SESSION_MODE_UNSPECIFIED'
  | 'INTERVIEW_PREP'
  | 'INTERVIEW_LIVE'
  | 'SALES'
  | 'SUPPORT'
  | 'MEETING_NOTES';
export type SessionState =
  | 'SESSION_STATE_UNSPECIFIED'
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'CUE'
  | 'ERROR';
export type TranscriptKind = 'TRANSCRIPT_KIND_UNSPECIFIED' | 'PARTIAL' | 'FINAL';
export type CueKind = 'CUE_KIND_UNSPECIFIED' | 'DELTA' | 'DONE' | 'NONE' | 'CUE_ERROR';
export type Speaker = 'SPEAKER_UNSPECIFIED' | 'THEM' | 'ME';
export type Model = 'MODEL_UNSPECIFIED' | 'HAIKU_4_5' | 'SONNET_5';

export interface AudioFormat {
  codec: Codec;
  sampleRate: number;
  channels: number;
}

export interface StartSession {
  sessionId: string;
  orgId: string;
  userId: string;
  dataRegion: string;
  mode: SessionMode;
  format: AudioFormat;
  documentIds: string[];
  disclosed: boolean;
  language: string;
  resumeFromSeq: number;
}

export interface AudioChunk {
  channel: Channel;
  sequence: number;
  /** Opus packet | PCM16 (linear16 LE) chunk. */
  payload: Buffer | Uint8Array;
  capturedAtMs: number;
}

export type StopSession = Record<string, never>;

/** Client -> server envelope. `kind` names whichever field is set (oneof). */
export type ClientEnvelope =
  | { kind: 'start'; start: StartSession }
  | { kind: 'audio'; audio: AudioChunk }
  | { kind: 'stop'; stop: StopSession };

export interface Transcript {
  kind: TranscriptKind;
  speaker: Speaker;
  text: string;
  seq: number;
  startMs: number;
  endMs: number;
  tsMs: number;
  confidence: number;
}

export interface Cue {
  kind: CueKind;
  id: string;
  text: string;
  seq: number;
  model: Model;
}

export interface State {
  state: SessionState;
  detail: string;
  resumedFromSeq: number;
}

/** Server -> client envelope. `kind` names whichever field is set (oneof). */
export type ServerEnvelope =
  | { kind: 'transcript'; transcript: Transcript }
  | { kind: 'cue'; cue: Cue }
  | { kind: 'state'; state: State };

/* ------------------------------------------------------------------ *
 * Typed client + server surfaces
 * ------------------------------------------------------------------ */

/** The typed bidi client. `Stream()` opens the long-lived per-session duplex. */
export interface OrchestratorClient extends grpc.Client {
  Stream(
    metadata?: grpc.Metadata,
    options?: Partial<grpc.CallOptions>,
  ): grpc.ClientDuplexStream<ClientEnvelope, ServerEnvelope>;
}

/** The handler an ai-orchestrator gRPC server implements. */
export interface OrchestratorHandlers extends grpc.UntypedServiceImplementation {
  Stream: grpc.handleBidiStreamingCall<ClientEnvelope, ServerEnvelope>;
}

interface OrchestratorGrpcObject extends grpc.GrpcObject {
  cue: {
    orchestrator: {
      v1: {
        Orchestrator: grpc.ServiceClientConstructor;
      };
    };
  };
}

let cachedObject: OrchestratorGrpcObject | undefined;

/** Load (once) and return the generated gRPC package object. */
export function loadOrchestratorProto(): OrchestratorGrpcObject {
  if (!cachedObject) {
    const definition = protoLoader.loadSync(PROTO_PATH, PROTO_LOADER_OPTIONS);
    cachedObject = grpc.loadPackageDefinition(definition) as unknown as OrchestratorGrpcObject;
  }
  return cachedObject;
}

/** The Orchestrator service constructor (also its `.service` definition). */
export function getOrchestratorService(): grpc.ServiceClientConstructor {
  return loadOrchestratorProto().cue.orchestrator.v1.Orchestrator;
}

/**
 * Construct a typed Orchestrator client. Defaults to an insecure channel
 * (internal same-VPC hop); pass credentials for TLS via ECS Service Connect.
 */
export function createOrchestratorClient(
  address: string,
  credentials: grpc.ChannelCredentials = grpc.credentials.createInsecure(),
  options?: Partial<grpc.ChannelOptions>,
): OrchestratorClient {
  const Service = getOrchestratorService();
  return new Service(address, credentials, options) as unknown as OrchestratorClient;
}

/** Register an Orchestrator implementation on a grpc.Server. */
export function addOrchestratorService(server: grpc.Server, impl: OrchestratorHandlers): void {
  server.addService(getOrchestratorService().service, impl);
}

export { grpc };
