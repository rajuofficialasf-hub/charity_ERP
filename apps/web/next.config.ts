import { withSerwist } from '@serwist/turbopack';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

// Serwist builds the service worker through a route handler (app/serwist/[path]/route.ts),
// which works with Turbopack, the default bundler of Next 16.
export default withSerwist(nextConfig);
