import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { watchInstall } from './features/sync/install';
import { loadMessages, readLocale } from './i18n/locale';
import { announceUpdate } from './lib/app-update';
import './styles/globals.css';

// The first render waits for the start part of the device language's catalogue, the only part in
// the first load (the pages after the login wait for the rest themselves); if it cannot load, the
// app renders anyway and the language provider tries again.
const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
void loadMessages(readLocale()).then(render, render);

// the browser's install prompt fires early; it is kept for the moment the person asks
watchInstall();

// The service worker precaches the build and the fonts (docs/architecture/OFFLINE_SYNC.md, the
// app shell and the service worker). Registered in production builds only, so development
// always serves fresh files. A new version waits until the person asks for the reload
// (UpdateReady), so a form in progress is never swapped out.
if (import.meta.env.PROD) {
  void import('virtual:serwist').then(async ({ getSerwist }) => {
    const serwist = await getSerwist();
    if (!serwist) return;
    serwist.addEventListener('waiting', () => {
      announceUpdate(() => {
        serwist.addEventListener('controlling', () => window.location.reload());
        serwist.messageSkipWaiting();
      });
    });
    await serwist.register();
  });
}
