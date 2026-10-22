import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { RouteError } from '../components/RouteError';
import { LoginPage } from '../features/auth/LoginPage';

/** The dev-only component gallery (T1.4) exists in `vite dev` and in the E2E build only. */
export const GALLERY_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEV_GALLERY === '1';

// Constant-folded at build time, so a normal production build has no gallery chunk at all.
const GalleryPage = GALLERY_ENABLED ? lazy(() => import('../dev/GalleryPage')) : null;

/**
 * Every screen of the PWA: the sign-in pages alone, every signed-in page inside the app shell.
 * Only the login is in the first load; every other screen, the shell too, is its own chunk, so the
 * first route stays within the JavaScript budget of docs/NON_FUNCTIONAL_REQUIREMENTS.md.
 */
export function routes(options: { gallery?: boolean } = {}): RouteObject[] {
  const gallery = options.gallery ?? GALLERY_ENABLED;
  return [
    {
      errorElement: <RouteError />,
      children: [
        { path: '/login', element: <LoginPage /> },
        {
          path: '/login/reset',
          lazy: async () => ({ Component: (await import('../features/auth/ResetPage')).ResetPage }),
        },
        {
          path: '/invite',
          lazy: async () => ({
            Component: (await import('../features/auth/InvitePage')).InvitePage,
          }),
        },
        {
          path: '/register',
          lazy: async () => ({
            Component: (await import('../features/registration/RegisterPage')).RegisterPage,
          }),
        },
        {
          lazy: async () => ({
            Component: (await import('../components/shell/AppShell')).AppShell,
          }),
          children: [
            {
              path: '/',
              lazy: async () => ({
                Component: (await import('../features/home/MyWorkPage')).MyWorkPage,
              }),
            },
            {
              path: '/account/profile',
              lazy: async () => ({
                Component: (await import('../features/account/ProfileView')).ProfileView,
              }),
            },
            {
              path: '/account/sessions',
              lazy: async () => ({
                Component: (await import('../features/account/SessionsView')).SessionsView,
              }),
            },
            {
              path: '/account/password',
              lazy: async () => ({
                Component: (await import('../features/account/ChangePasswordView'))
                  .ChangePasswordView,
              }),
            },
            {
              path: '/notifications',
              lazy: async () => ({
                Component: (await import('../features/notifications/NotificationsPage'))
                  .NotificationsPage,
              }),
            },
            // the volunteer's own projects load with their own chunk, like the admin pages
            {
              path: '/my-projects',
              lazy: async () => ({
                Component: (await import('../features/projects/MyProjectsPage')).MyProjectsPage,
              }),
            },
            {
              path: '/my-projects/:projectId',
              lazy: async () => ({
                Component: (await import('../features/projects/MyProjectPage')).MyProjectPage,
              }),
            },
            {
              path: '/my-projects/:projectId/team',
              lazy: async () => ({
                Component: (await import('../features/projects/TeamPage')).TeamPage,
              }),
            },
            {
              // The admin area is its own chunk: the other screens never load it.
              path: '/admin',
              lazy: async () => ({ Component: (await import('../admin/AdminLayout')).AdminLayout }),
              children: [
                // My Work is the home of the officials too
                { index: true, element: <Navigate to="/" replace /> },
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
                  path: 'projects/:projectId/forms',
                  lazy: async () => ({
                    Component: (await import('../admin/forms/FormsPage')).FormsPage,
                  }),
                },
                {
                  path: 'projects/:projectId/forms/:formId',
                  lazy: async () => ({
                    Component: (await import('../admin/forms/FormBuilderPage')).FormBuilderPage,
                  }),
                },
                {
                  path: 'projects/:projectId/volunteers',
                  lazy: async () => ({
                    Component: (await import('../admin/projects/volunteers/ProjectVolunteersPage'))
                      .ProjectVolunteersPage,
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
                  path: 'beneficiaries/duplicates',
                  lazy: async () => ({
                    Component: (await import('../admin/beneficiaries/duplicates/DuplicatesPage'))
                      .DuplicatesPage,
                  }),
                },
                {
                  path: 'beneficiaries/duplicates/compare',
                  lazy: async () => ({
                    Component: (await import('../admin/beneficiaries/duplicates/ComparePage'))
                      .ComparePage,
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
                  path: 'staff',
                  lazy: async () => ({
                    Component: (await import('../admin/staff/StaffPage')).StaffPage,
                  }),
                },
                {
                  path: 'staff/:userId',
                  lazy: async () => ({
                    Component: (await import('../admin/staff/StaffProfilePage')).StaffProfilePage,
                  }),
                },
                {
                  path: 'staff/organogram',
                  lazy: async () => ({
                    Component: (await import('../admin/staff/OrganogramPage')).OrganogramPage,
                  }),
                },
                {
                  path: 'settings',
                  lazy: async () => ({
                    Component: (await import('../admin/settings/SettingsPage')).SettingsPage,
                  }),
                },
                {
                  path: 'nisab',
                  lazy: async () => ({
                    Component: (await import('../admin/nisab/NisabPage')).NisabPage,
                  }),
                },
                {
                  path: 'audit',
                  lazy: async () => ({
                    Component: (await import('../admin/audit/AuditPage')).AuditPage,
                  }),
                },
                {
                  path: 'sessions',
                  lazy: async () => ({
                    Component: (await import('../admin/system/SessionsPage')).SessionsPage,
                  }),
                },
                {
                  path: 'health',
                  lazy: async () => ({
                    Component: (await import('../admin/system/HealthPage')).HealthPage,
                  }),
                },
                {
                  path: 'notification-templates',
                  lazy: async () => ({
                    Component: (await import('../admin/notifications/NotificationTemplatesPage'))
                      .NotificationTemplatesPage,
                  }),
                },
                {
                  path: 'deliveries',
                  lazy: async () => ({
                    Component: (await import('../admin/notifications/DeliveriesPage'))
                      .DeliveriesPage,
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
                    Component: (await import('../admin/permissions/PermissionsPage'))
                      .PermissionsPage,
                  }),
                },
              ],
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
