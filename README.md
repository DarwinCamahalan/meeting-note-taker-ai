# meeting-note-taker-ai
A Meeting note taker powered by AI

## Getting started — Phase 0 spike

Phase 0 proves the thinnest end-to-end thread — **microphone audio → Deepgram
streaming STT → Claude (`claude-haiku-4-5`) streaming cue → content-protected
overlay** — on an Electron app whose overlay window is excluded from screen
capture/share. It is a throwaway-quality technical spike, not a shippable build.

### Prerequisites

- **Node 22** (see `.nvmrc`; `nvm use` picks it up).
- **pnpm** (this repo uses pnpm workspaces + Turborepo).
- An **Anthropic API key** and a **Deepgram API key**.
- No code signing, notarization, or Apple Developer account is needed for the
  spike — you run the app unpackaged via the dev server.

### Setup

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Configure secrets (never commit .env — it is gitignored)
cp .env.example .env
#   then edit .env and set:
#     ANTHROPIC_API_KEY=...
#     DEEPGRAM_API_KEY=...

# 3. Run the overlay (electron-vite dev)
pnpm --filter @cue/desktop dev
```

Grant the microphone permission when macOS/Windows prompts. Press
`Cmd/Ctrl + \` to toggle the overlay; use the in-overlay Start/Stop control to
begin and end a listening session.

### Capture scope (honest)

- **Microphone capture works** — the renderer uses `getUserMedia` + an
  AudioWorklet to produce 16 kHz mono linear16 PCM chunks, sufficient to prove
  the Phase 0 thread.
- **System loopback (the other party's audio) is a stubbed native TODO.** Real
  loopback needs platform native bindings (macOS ScreenCaptureKit / Core Audio
  taps; Windows WASAPI loopback) and is gated behind descoped consent work. See
  `NotImplementedLoopbackCapture` in `@cue/core`.

### Verify content protection

The overlay calls `setContentProtection(true)` (maps to
`NSWindowSharingType=none` on macOS and `WDA_EXCLUDEFROMCAPTURE` on Windows).
Before trusting it, verify the overlay is **absent** from screen-share and
recording surfaces — Zoom / Google Meet / Microsoft Teams screen-share, plus OS
recorders (macOS `screencapture`/ScreenCaptureKit, Windows Game Bar). These map
to acceptance criteria **A-1 / A-2 / A-3** in
[`docs/81-phase-0-spike-plan.md`](docs/81-phase-0-spike-plan.md#7-acceptance-criteria-all-must-pass-for-go).
Note that content protection excludes the window from capture only — it never
hides the process from the OS or EDR.

See [`apps/desktop/README.md`](apps/desktop/README.md) for how the implemented
pieces map to the Phase 0 acceptance criteria and the list of known TODOs.
