import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// Stub renderer entry (Phase 0 foundation). The Build phase owns ./App and the
// component/hook/store tree it renders.
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Cue overlay: #root element not found in index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
