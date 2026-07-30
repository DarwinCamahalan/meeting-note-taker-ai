import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AudioChunk, CueEvent, IpcApi, SessionState, TranscriptEvent } from '@cue/types';

/**
 * Cue preload bridge.
 *
 * Runs in a sandboxed, context-isolated preload and exposes exactly the typed
 * {@link IpcApi} surface on `window.cue`. The renderer never touches Electron
 * or Node APIs directly — only these thin, explicit proxies over IPC.
 */

/** Subscribe to a main -> renderer push channel; returns an unsubscribe fn. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => {
    cb(payload);
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: IpcApi = {
  startSession: async () => {
    await ipcRenderer.invoke('cue:start');
  },
  stopSession: async () => {
    await ipcRenderer.invoke('cue:stop');
  },
  sendAudioChunk: (c: AudioChunk) => {
    ipcRenderer.send('cue:audio', c);
  },
  toggleOverlay: () => {
    void ipcRenderer.invoke('cue:toggle');
  },
  onState: (cb: (s: SessionState) => void) => subscribe<SessionState>('cue:state', cb),
  onTranscript: (cb: (t: TranscriptEvent) => void) =>
    subscribe<TranscriptEvent>('cue:transcript', cb),
  onCue: (cb: (e: CueEvent) => void) => subscribe<CueEvent>('cue:cue', cb),
};

contextBridge.exposeInMainWorld('cue', api);
