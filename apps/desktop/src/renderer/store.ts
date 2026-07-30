import { create } from 'zustand';
import type { CueEvent, SessionState, TranscriptEvent } from '@cue/types';
import type { CueVm } from './types';

/**
 * Single source of UI truth for the overlay. The main process is authoritative
 * for session state and events; this store just reduces the streams it pushes
 * (onState / onTranscript / onCue) into a render-friendly shape.
 */

/** Cap retained cues so a long session never grows the array unboundedly. */
const MAX_CUES = 20;

export interface CueStore {
  /** Latest session state pushed by main. */
  state: SessionState;
  /** Rolling committed (final) transcript text. */
  transcript: string;
  /** Current interim/partial hypothesis (cleared when it finalizes). */
  partial: string;
  /** Reduced cues, oldest first; the last entry is the active one. */
  cues: CueVm[];

  setState(state: SessionState): void;
  applyTranscript(event: TranscriptEvent): void;
  applyCue(event: CueEvent): void;
  reset(): void;
}

/** Fold one CueEvent into the existing cue list (pure). */
function reduceCue(cues: CueVm[], event: CueEvent): CueVm[] {
  const idx = cues.findIndex((c) => c.id === event.id);
  const existing = idx >= 0 ? cues[idx] : undefined;
  const base: CueVm = existing ?? { id: event.id, text: '', status: 'streaming' };

  let next: CueVm;
  switch (event.kind) {
    case 'delta':
      next = { ...base, text: base.text + (event.text ?? ''), status: 'streaming' };
      break;
    case 'done':
      next = { ...base, status: 'done' };
      break;
    case 'none':
      next = { ...base, status: 'none' };
      break;
    case 'error':
      next = { ...base, status: 'error', text: event.text ?? 'Cue failed' };
      break;
    default:
      next = base;
  }

  const list = existing ? cues.map((c, i) => (i === idx ? next : c)) : [...cues, next];
  return list.length > MAX_CUES ? list.slice(list.length - MAX_CUES) : list;
}

export const useCueStore = create<CueStore>()((set) => ({
  state: 'idle',
  transcript: '',
  partial: '',
  cues: [],

  setState: (state) => set({ state }),

  applyTranscript: (event) =>
    set((s) =>
      event.kind === 'final'
        ? { transcript: `${s.transcript}${s.transcript ? ' ' : ''}${event.text}`.trim(), partial: '' }
        : { partial: event.text },
    ),

  applyCue: (event) => set((s) => ({ cues: reduceCue(s.cues, event) })),

  reset: () => set({ state: 'idle', transcript: '', partial: '', cues: [] }),
}));
