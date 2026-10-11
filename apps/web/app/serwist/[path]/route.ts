import { createSerwistRoute } from '@serwist/turbopack';

// Serves /serwist/sw.js, built with esbuild from app/sw.ts at build time.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: 'app/sw.ts',
    useNativeEsbuild: true,
  },
);
