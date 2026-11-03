import { useTranslations } from 'use-intl';
import { DocumentTitle } from '../components/DocumentTitle';
import { AsfGallery } from './AsfGallery';
import './asf-gallery.css';

// Dev-only route beside the earlier set's gallery: in `vite dev` or with VITE_DEV_GALLERY=1 (the
// E2E build), never in a normal production build (routes/index.tsx).
export default function AsfGalleryPage() {
  const t = useTranslations('gallery.asf');
  return (
    <>
      <DocumentTitle title={t('title')} />
      <meta name="robots" content="noindex, nofollow" />
      <main id="main">
        <AsfGallery />
      </main>
    </>
  );
}
