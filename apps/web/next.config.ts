import { withSerwist } from '@serwist/turbopack';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// The dev-only component gallery (/dev/components, T1.4) lives in `*.dev.tsx` route files, which
// are routes only in `next dev` or when CSS_DEV_GALLERY=1 (the E2E build). A normal production
// build does not contain it at all.
const devRoutes = process.env.NODE_ENV !== 'production' || process.env.CSS_DEV_GALLERY === '1';

// The PWA and the API share one origin (AUTH.md 5: the refresh cookie and CSRF need it). In
// production Caddy routes /api/* to the API before Next sees it; in development and E2E this
// rewrite forwards /api/v1/* to the API process (CSS_API_ORIGIN, server-side only).
const apiOrigin = process.env.CSS_API_ORIGIN ?? 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  pageExtensions: devRoutes ? ['dev.tsx', 'tsx', 'ts'] : ['tsx', 'ts'],
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` }];
  },
};

// next-intl reads the request language from i18n/request.ts (D-067).
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// Serwist builds the service worker through a route handler (app/serwist/[path]/route.ts),
// which works with Turbopack, the default bundler of Next 16.
export default withSerwist(withNextIntl(nextConfig));
