import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import './globals.css';
import { AppProviders } from './_components/AppProviders';
import { AuthProvider } from './_lib/auth';
import { ServiceWorkerProvider } from './service-worker-provider';

// Texts come from the catalogue in the user's language (T1.5); tokens and fonts from @css/ui
// through globals.css (T1.4); the app shell comes in T1.15.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common.app');
  return {
    title: t('name'),
    description: t('description'),
    applicationName: t('short_name'),
  };
}

export const viewport: Viewport = {
  themeColor: '#008E48',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const { auth, common, nav, ui } = await getMessages();
  return (
    <html lang={locale}>
      <body>
        {/* The client receives only the namespaces every page needs (I18N 3.4, NFR-15). */}
        <NextIntlClientProvider messages={{ auth, common, nav, ui }}>
          <AppProviders>
            <AuthProvider>
              <ServiceWorkerProvider>{children}</ServiceWorkerProvider>
            </AuthProvider>
          </AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
