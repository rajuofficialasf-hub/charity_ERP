// Web app manifest in the default language bn (I18N 2): the full name per UX-09 and the
// home-screen short name per O-31 from the catalogue; colours are the brand tokens of
// docs/ui/brand/colors.md (brand/primary, bg/canvas); the icon is a placeholder until the logo
// file is supplied (T1.15). Served at /manifest.webmanifest by the Vite plugin in vite.config.ts.
import { translate } from '@css/shared/i18n';

export function manifest() {
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
