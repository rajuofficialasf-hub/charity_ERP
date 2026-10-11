import type { MetadataRoute } from 'next';

/**
 * Web app manifest. Full name per UX-09, home-screen short name per O-31. Colours are the brand
 * tokens of docs/ui/brand/colors.md (brand/primary, bg/canvas). The icon is a placeholder until
 * the logo file is supplied (T1.15).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'চ্যারিটি ও সোশ্যাল সার্ভিস',
    short_name: 'ASF Charity',
    description: 'As-Sunnah Foundation, Charity & Social Service Department',
    lang: 'bn',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#008E48',
    background_color: '#F2F3F7',
    icons: [{ src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
