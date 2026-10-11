import { useMessages } from 'use-intl';
import { DocumentTitle } from '../components/DocumentTitle';
import { Gallery } from './Gallery';

// Dev-only route (T1.4): in `vite dev` or with VITE_DEV_GALLERY=1 (the E2E build), never in a
// normal production build (routes/index.tsx). The language comes from the device like every page.
export default function GalleryPage() {
  const { gallery } = useMessages();
  return (
    <>
      <DocumentTitle title={gallery.title} />
      <meta name="robots" content="noindex, nofollow" />
      <Gallery />
    </>
  );
}
