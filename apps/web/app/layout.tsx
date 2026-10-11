import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ServiceWorkerProvider } from './service-worker-provider';

// Texts below are converted to i18n keys in T1.5; tokens, fonts and the app shell come in T1.4
// and T1.15.
export const metadata: Metadata = {
  title: 'চ্যারিটি ও সোশ্যাল সার্ভিস',
  description: 'As-Sunnah Foundation, Charity & Social Service Department ERP',
  applicationName: 'ASF Charity',
};

export const viewport: Viewport = {
  themeColor: '#008E48',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <body>
        <ServiceWorkerProvider>{children}</ServiceWorkerProvider>
      </body>
    </html>
  );
}
