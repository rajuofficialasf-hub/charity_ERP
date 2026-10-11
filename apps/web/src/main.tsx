import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The service worker precaches the build (ADR-013); runtime caching and the outbox come in T2.7.
// Registered in production builds only, so development always serves fresh files.
if (import.meta.env.PROD) {
  void import('virtual:serwist').then(({ getSerwist }) =>
    getSerwist().then((serwist) => serwist?.register()),
  );
}
