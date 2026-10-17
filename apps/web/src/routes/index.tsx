import { lazy, Suspense } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { RouteError } from '../components/RouteError';
import { ChangePasswordView } from '../features/account/ChangePasswordView';
import { HomeView } from '../features/account/HomeView';
import { ProfileView } from '../features/account/ProfileView';
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
        { path: '/account/profile', element: <ProfileView /> },
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
              path: 'programs',
              lazy: async () => ({
                Component: (await import('../admin/programs/ProgramsPage')).ProgramsPage,
              }),
            },
            {
              path: 'templates',
              lazy: async () => ({
                Component: (await import('../admin/templates/TemplatesPage')).TemplatesPage,
              }),
            },
            {
              path: 'projects',
              lazy: async () => ({
                Component: (await import('../admin/projects/ProjectsPage')).ProjectsPage,
              }),
            },
            {
              path: 'projects/new',
              lazy: async () => ({
                Component: (await import('../admin/projects/setup/ProjectSetupPage'))
                  .ProjectSetupPage,
              }),
            },
            {
              path: 'projects/:projectId',
              lazy: async () => ({
                Component: (await import('../admin/projects/ProjectOverviewPage'))
                  .ProjectOverviewPage,
              }),
            },
            {
              path: 'projects/:projectId/setup',
              lazy: async () => ({
                Component: (await import('../admin/projects/setup/ProjectSetupPage'))
                  .ProjectSetupPage,
              }),
            },
            {
              path: 'volunteers',
              lazy: async () => ({
                Component: (await import('../admin/volunteers/VolunteersPage')).VolunteersPage,
              }),
            },
            {
              path: 'volunteers/:volunteerId',
              lazy: async () => ({
                Component: (await import('../admin/volunteers/VolunteerProfilePage'))
                  .VolunteerProfilePage,
              }),
            },
            {
              path: 'beneficiaries',
              lazy: async () => ({
                Component: (await import('../admin/beneficiaries/BeneficiariesPage'))
                  .BeneficiariesPage,
              }),
            },
            {
              path: 'beneficiaries/:beneficiaryId',
              lazy: async () => ({
                Component: (await import('../admin/beneficiaries/BeneficiaryProfilePage'))
                  .BeneficiaryProfilePage,
              }),
            },
            {
              path: 'registrations',
              lazy: async () => ({
                Component: (await import('../admin/registrations/RegistrationsPage'))
                  .RegistrationsPage,
              }),
            },
            {
              path: 'registrations/:userId',
              lazy: async () => ({
                Component: (await import('../admin/registrations/RegistrationDetail'))
                  .RegistrationDetail,
              }),
            },
            {
              path: 'handover',
              lazy: async () => ({
                Component: (await import('../admin/handover/HandoverPage')).HandoverPage,
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
