/**
 * Entry point. Mounts the Delegate Wave creator dashboard.
 *
 * All page data flows through the frozen relay in src/bridge/bridge.ts via
 * postMessage; the page never performs a network request and never holds a
 * credential. This project owns presentation, intent entry, and the Integrate /
 * Reject gestures only — operational truth, workers, Git, validation, budget,
 * authorization and integration all belong to delegate-wave.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './ui/App';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('the Delegate Wave Backpack has no mount point');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);