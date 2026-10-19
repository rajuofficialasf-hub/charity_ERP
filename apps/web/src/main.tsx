import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { loadMessages, readLocale } from './i18n/locale';
import './styles/globals.css';

// The first render waits for the device language's catalogue, the only one in the first load;
// if it cannot load, the app renders anyway and the language provider tries again.
const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
void loadMessages(readLocale()).then(render, render);

// The service worker precaches the build (ADR-013); runtime caching and the outbox come in T2.7.
// Registered in production builds only, so development always serves fresh files.
if (import.meta.env.PROD) {
  void import('virtual:serwist').then(({ getSerwist }) =>
    getSerwist().then((serwist) => serwist?.register()),
  );
}
