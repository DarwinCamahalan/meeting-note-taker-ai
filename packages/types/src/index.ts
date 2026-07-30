/**
 * @cue/types — the single source of truth for contracts that cross a process
 * boundary in Cue: main <-> preload <-> renderer, and the STT -> LLM pipeline.
 *
 * These types are intentionally minimal (Phase 0 spike surface). Keep them
 * transport-agnostic: plain data only, no class instances, so they survive
 * Electron's structured-clone IPC.
 */

/** Lifecycle of a single copilot session, surfaced to the overlay UI. */
export type SessionState = 'idle' | 'listening' | 'thinking' | 'cue' | 'error';

/**
 * A slice of captured PCM audio flowing renderer -> main -> STT.
 * Phase 0 produces 16 kHz mono linear16 from the microphone.
 */
export interface AudioChunk {
  /** Raw PCM samples (linear16, little-endian). */
  data: ArrayBuffer;
  /** Samples per second (Phase 0: 16000). */
  sampleRate: number;
  /** Channel count (Phase 0: 1). */
  channels: number;
  /** Client capture timestamp (epoch ms). */
  ts: number;
}

/** A transcription result emitted by the STT client. */
export interface TranscriptEvent {
  /** `partial` = interim/unstable, `final` = endpointed and committed. */
  kind: 'partial' | 'final';
  text: string;
  /** Event timestamp (epoch ms). */
  ts: number;
}

/**
 * A unit of streamed cue output from the LLM.
 * - `delta`: incremental text token(s) to append to the current cue.
 * - `done`:  the current cue is complete.
 * - `none`:  the model decided no cue is warranted (`<none>` sentinel).
 * - `error`: cue generation failed; `text` may carry a human-readable reason.
 */
export interface CueEvent {
  kind: 'delta' | 'done' | 'none' | 'error';
  /** Stable id grouping all events belonging to one cue. */
  id: string;
  text?: string;
}

/**
 * Sign-in lifecycle surfaced to the overlay UI.
 * - `signed_out`:     no tokens; the user must run the PKCE flow.
 * - `authenticating`: PKCE flow in progress (browser opened, polling exchange).
 * - `signed_in`:      tokens held; `user` is populated from `GET /v1/me`.
 * - `error`:          the last login attempt failed; `error` carries the reason.
 */
export type AuthStatus = 'signed_out' | 'authenticating' | 'signed_in' | 'error';

/** Minimal identity summary surfaced to the overlay (never the raw tokens). */
export interface AuthUserSummary {
  email: string;
  displayName: string | null;
}

/** Auth state pushed main -> renderer (mirrors the main-process AuthManager). */
export interface AuthState {
  status: AuthStatus;
  /** Present once `GET /v1/me` resolves. */
  user?: AuthUserSummary;
  /** During `authenticating`: the web page opened in the system browser. */
  verificationUri?: string;
  /** Present when `status === 'error'`. */
  error?: string;
}

/** Which window a renderer instance is painting (from the `?view=` query). */
export type WindowView = 'dashboard' | 'overlay';

/** Read-only runtime status shown on the dashboard. */
export interface AppStatus {
  /** Speech-to-text backend in effect. */
  sttProvider: 'deepgram' | 'local-whisper';
  /** Local-whisper model name (when sttProvider is local-whisper). */
  whisperModel: string;
  /** Whether an Anthropic key is configured (cue generation works). */
  anthropicKeyPresent: boolean;
  /** Pipeline backend: in-process `local` or `gateway`. */
  backend: 'local' | 'gateway';
  /** App version (from package.json). */
  appVersion: string;
  /** OS platform: `darwin` | `win32` | `linux`. */
  platform: string;
}

/** User-editable settings persisted by the main process. */
export interface AppSettings {
  /** Local-whisper ggml model: `tiny.en` | `base.en` | `small.en` | … */
  whisperModel: string;
  /** Transcription language (ISO-639-1). */
  language: string;
}

/**
 * The API surface exposed to the renderer on `window.cue` via the preload
 * contextBridge. Every method is a thin, typed proxy over Electron IPC.
 * Each `on*` subscriber returns an unsubscribe function.
 */
export interface IpcApi {
  startSession(): Promise<void>;
  stopSession(): Promise<void>;
  sendAudioChunk(c: AudioChunk): void;
  toggleOverlay(): void;
  onState(cb: (s: SessionState) => void): () => void;
  onTranscript(cb: (t: TranscriptEvent) => void): () => void;
  onCue(cb: (e: CueEvent) => void): () => void;

  /* --- Dashboard + window control (Phase 0 UX) --- */
  /** Runtime status for the dashboard panel. */
  getStatus(): Promise<AppStatus>;
  /** Read persisted settings. */
  getSettings(): Promise<AppSettings>;
  /** Patch + persist settings; returns the merged result. */
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  /** Dashboard → reveal the content-protected listening overlay. */
  startListening(): Promise<void>;
  /** Overlay → hide it and return to the dashboard. */
  stopListening(): Promise<void>;

  /* --- Phase 1 auth (OAuth2 PKCE via the system browser) --- */
  /** Begin (or return the settled result of) the PKCE device flow. */
  login(): Promise<AuthState>;
  /** Drop tokens and return to `signed_out`. */
  logout(): Promise<void>;
  /** Read the current auth state (for initial hydration). */
  getAuthState(): Promise<AuthState>;
  /** Subscribe to auth-state pushes; returns an unsubscribe fn. */
  onAuthState(cb: (s: AuthState) => void): () => void;
}

declare global {
  interface Window {
    cue: IpcApi;
  }
}

/**
 * Phase 1 HTTP/WS contract surface (auth DTOs, resources, problem+json, and
 * the `cue.v1` WebSocket control envelope). Kept in a separate module so the
 * Phase 0 IPC/pipeline types above stay minimal and unchanged.
 */
export * from './api.js';

/**
 * Phase 2 contract surface. `billing.js` = subscriptions / entitlements /
 * usage / Stripe DTOs; `documents.js` = RAG documents / chunks / retrieval.
 * Both are additive and do not shadow any Phase 0/1 export.
 */
export * from './billing.js';
export * from './documents.js';

/**
 * Phase 3 contract surface. `sso.js` = enterprise SSO / SCIM (WorkOS) DTOs;
 * `admin.js` = RBAC roles / permissions / guard metadata, invites, member +
 * role management, org settings, audit log, and seat accounting. Both are
 * additive and do not shadow any Phase 0/1/2 export.
 */
export * from './sso.js';
export * from './admin.js';

export {};
