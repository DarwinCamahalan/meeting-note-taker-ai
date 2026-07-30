import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// The @cue/* workspace packages ship TypeScript-authored ESM; bundle them into
// the main/preload output instead of externalizing so they load cleanly in the
// (CommonJS) Electron main context. Their transitive SDK deps (@anthropic-ai,
// @deepgram) are bundled too since they are not declared on @cue/desktop.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@cue/core', '@cue/types'] })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@cue/types'] })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
});
