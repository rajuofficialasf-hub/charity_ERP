import type { Metadata } from 'next';
import { Gallery } from './Gallery';

// Dev-only route (T1.4): a route only in `next dev` or with CSS_DEV_GALLERY=1 (next.config.ts).
export const metadata: Metadata = {
  title: 'Component gallery',
  robots: { index: false, follow: false },
};

export default async function ComponentGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  return <Gallery initialLocale={lang === 'en' ? 'en' : 'bn'} />;
}
