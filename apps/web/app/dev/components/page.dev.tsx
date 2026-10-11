import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { Gallery } from './Gallery';

// Dev-only route (T1.4): a route only in `next dev` or with CSS_DEV_GALLERY=1 (next.config.ts).
// The language comes from the css_locale cookie like every page (T1.5).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('gallery');
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function ComponentGalleryPage() {
  const { common, nav, ui, gallery } = await getMessages();
  return (
    <NextIntlClientProvider messages={{ common, nav, ui, gallery }}>
      <Gallery />
    </NextIntlClientProvider>
  );
}
