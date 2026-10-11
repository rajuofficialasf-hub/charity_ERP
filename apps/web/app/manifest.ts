import { translate } from '@css/shared/i18n';
import type { MetadataRoute } from 'next';

/**
 * Web app manifest in the default language bn (I18N 2). Full name per UX-09, home-screen short name
 * per O-31, both from the catalogue. Colours are the brand
 * tokens of docs/ui/brand/colors.md (brand/primary, bg/canvas). The icon is a placeholder until
 * the logo file is supplied (T1.15).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: translate('bn', 'common.app.name'),
    short_name: translate('bn', 'common.app.short_name'),
    description: translate('bn', 'common.app.description'),
    lang: 'bn',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#008E48',
    background_color: '#F2F3F7',
    icons: [{ src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
