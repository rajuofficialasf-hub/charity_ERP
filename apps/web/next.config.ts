import { withSerwist } from '@serwist/turbopack';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// The dev-only component gallery (/dev/components, T1.4) lives in `*.dev.tsx` route files, which
// are routes only in `next dev` or when CSS_DEV_GALLERY=1 (the E2E build). A normal production
// build does not contain it at all.
const devRoutes = process.env.NODE_ENV !== 'production' || process.env.CSS_DEV_GALLERY === '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  pageExtensions: devRoutes ? ['dev.tsx', 'tsx', 'ts'] : ['tsx', 'ts'],
};

// next-intl reads the request language from i18n/request.ts (D-067).
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// Serwist builds the service worker through a route handler (app/serwist/[path]/route.ts),
// which works with Turbopack, the default bundler of Next 16.
export default withSerwist(withNextIntl(nextConfig));
