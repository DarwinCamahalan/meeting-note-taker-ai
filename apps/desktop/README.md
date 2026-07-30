# @cue/desktop — Phase 0 spike (Electron overlay)

The content-protected AI cue overlay. This app wires the shared `@cue/core`
pipeline (Deepgram STT → Claude cue) to a transparent, capture-excluded
Electron `BrowserWindow` and a React 19 renderer.

Run it from the repo root:

```bash
pnpm --filter @cue/desktop dev
```

Secrets come from `.env` at the repo root (`ANTHROPIC_API_KEY`,
`DEEPGRAM_API_KEY`) — see the root [README](../../README.md).

## Module map

| File | Responsibility |
| --- | --- |
| `src/main/index.ts` | Coordinator: `whenReady → createOverlayWindow → createPipeline → registerIpc → registerGlobalShortcuts`; single-instance lock + lifecycle. |
| `src/main/window.ts` | `createOverlayWindow(preloadPath)` — applies all content-protection settings; loads the dev URL or built `index.html`. |
| `src/main/shortcuts.ts` | `registerGlobalShortcuts` / `unregisterAll` — `Cmd/Ctrl + \` toggles the overlay. |
| `src/main/ipc.ts` | `registerIpc(win, pipeline)` — bridges `cue:start/stop/toggle/audio` and forwards `cue:state/transcript/cue` to the renderer. |
| `src/main/pipeline-runner.ts` | `createPipeline(cfg)` — thin wrapper over `@cue/core`'s `createOrchestrator`. |
| `src/preload/index.ts` | `contextBridge.exposeInMainWorld('cue', …)` — the typed `IpcApi`. |
| `src/renderer/**` | Zustand store + `use-cue-stream` / `use-audio-capture` hooks + `Overlay` / `CueCard` / `StatusIndicator` components. |

## How the implementation maps to Phase 0 acceptance criteria

Acceptance criteria live in
[`docs/81-phase-0-spike-plan.md` §7](../../docs/81-phase-0-spike-plan.md#7-acceptance-criteria-all-must-pass-for-go).
The spike delivers the **software substrate** for these; the criteria
themselves are verification gates that require the shared QA lab (real macOS +
Windows hardware and licensed conferencing accounts) and are **not** claimed as
passed by code alone.

### A — Content protection (overlay invisibility)

- **A-1 / A-2 / A-3** — `createOverlayWindow` sets `setContentProtection(true)`
  (→ `NSWindowSharingType=none` on macOS, `WDA_EXCLUDEFROMCAPTURE` on Windows),
  `setAlwaysOnTop(true, 'screen-saver')`, and
  `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`; on macOS the
  app runs as an accessory (`app.dock.hide()`). This is the mechanism the A-1/2/3
  gates test; **manual verification against Zoom/Meet/Teams share flows and OS
  recorders on real hardware is still required.**
- **A-4** — `visibleOnFullScreen` + `screen-saver` z-order address multi-monitor
  and full-screen meeting z-order. Display-hotplug re-assertion of affinity is a
  **TODO** (see below).
- **A-5** — Legacy-capture / RMM leak enumeration is a documentation/matrix task
  owned by the spike plan; not addressed in code.

### B — Audio capture

- **B-1** — **Partial.** Microphone capture works (`use-audio-capture.ts`:
  `getUserMedia` + AudioWorklet). System loopback on both OSes is a **stubbed
  native TODO** (`NotImplementedLoopbackCapture` in `@cue/core`).
- **B-2** — Mic is resampled to 16 kHz mono linear16 PCM before being sent over
  `window.cue.sendAudioChunk`. Golden-WAV intelligibility checks are a QA task.
- **B-3** — macOS TCC permission path (Microphone) is exercised at runtime; the
  Screen-Recording path and re-prompt/relaunch friction are documented in the
  spike plan, not automated here.

### C — End-to-end cue thread + latency

- **C-1** — `CueOrchestrator` produces a real `claude-haiku-4-5` streaming cue
  from live mic audio: `final` transcript → state `thinking` → streamed cue
  deltas → back to `listening`. The `<none>` sentinel maps to a `none` event.
- **C-2 / C-3** — The thread is wired for low latency (Deepgram
  `interim_results` + `endpointing: 300`, Claude streaming, no extended
  thinking). Measuring median `t0 → t1` and interim-transcript latency over
  ≥ 200 utterances per OS is a **QA-lab measurement task**, not verified by this
  spike code.

## Known TODOs (descoped for Phase 0)

- **Native system loopback** — macOS ScreenCaptureKit / Core Audio taps and
  Windows WASAPI loopback via an N-API addon; gated behind consent work.
- **Windows N-API content-protection addon + display-hotplug re-assertion** of
  `SetWindowDisplayAffinity` on monitor changes.
- **Packaging & signing** — `electron-builder` config exists but codesigning /
  notarization (macOS) and signing (Windows) are out of scope for the spike.
- **Real device / conferencing-app testing** — all A/B/C acceptance gates must
  be run on the shared QA lab (real hardware, current & current-1 OS versions,
  licensed Zoom/Meet/Teams/Webex).
- **Latency instrumentation** — timestamp capture and p50/p95 reporting for the
  `t0 → t1` budget.
