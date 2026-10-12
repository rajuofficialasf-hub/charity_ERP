import { lazy, Suspense } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { RouteError } from '../components/RouteError';
import { ChangePasswordView } from '../features/account/ChangePasswordView';
import { HomeView } from '../features/account/HomeView';
import { SessionsView } from '../features/account/SessionsView';
import { LoginPage } from '../features/auth/LoginPage';
import { ResetPage } from '../features/auth/ResetPage';
import { RegisterPage } from '../features/registration/RegisterPage';

/** The dev-only component gallery (T1.4) exists in `vite dev` and in the E2E build only. */
export const GALLERY_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEV_GALLERY === '1';

// Constant-folded at build time, so a normal production build has no gallery chunk at all.
const GalleryPage = GALLERY_ENABLED ? lazy(() => import('../dev/GalleryPage')) : null;

/** Every screen of the PWA; later tasks add the app shell layout (T1.15) and the modules. */
export function routes(options: { gallery?: boolean } = {}): RouteObject[] {
  const gallery = options.gallery ?? GALLERY_ENABLED;
  return [
    {
      errorElement: <RouteError />,
      children: [
        { path: '/', element: <HomeView /> },
        { path: '/login', element: <LoginPage /> },
        { path: '/login/reset', element: <ResetPage /> },
        { path: '/register', element: <RegisterPage /> },
        { path: '/account/sessions', element: <SessionsView /> },
        { path: '/account/password', element: <ChangePasswordView /> },
        {
          // The admin area is its own chunk (UX-15): the other screens never load it.
          path: '/admin',
          lazy: async () => ({ Component: (await import('../admin/AdminLayout')).AdminLayout }),
          children: [
            {
              index: true,
              lazy: async () => ({
                Component: (await import('../admin/DashboardPage')).DashboardPage,
              }),
            },
            {
              path: 'permissions',
              lazy: async () => ({
                Component: (await import('../admin/permissions/PermissionsPage')).PermissionsPage,
              }),
            },
          ],
        },
        ...(gallery && GalleryPage
          ? [
              {
                path: '/dev/components',
                element: (
                  <Suspense fallback={null}>
                    <GalleryPage />
                  </Suspense>
                ),
              },
            ]
          : []),
        {
          path: '*',
          element: <RouteError />,
          loader: () => {
            throw new Response('', { status: 404 });
          },
        },
      ],
    },
  ];
}

export const router = createBrowserRouter(routes());
