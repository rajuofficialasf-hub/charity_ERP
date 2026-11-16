import { type ComponentType, lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import type { AdminRouteHandle } from '../admin/AdminLayout';
import { RouteError } from '../components/RouteError';
import { LoginPage } from '../features/auth/LoginPage';
import { withRest } from '../i18n/locale';

/** The asf component gallery exists in `vite dev` and in the E2E build only. */
export const GALLERY_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEV_GALLERY === '1';

// Constant-folded at build time, so a normal production build has no gallery chunk at all.
const AsfGalleryPage = GALLERY_ENABLED
  ? lazy(() => withRest(import('../dev/AsfGalleryPage')))
  : null;

/**
 * A lazy route's page: the named export of its module, loaded together with the rest of the
 * catalogue (`withRest`), so the page renders only once its texts are in. A name the module does
 * not export as a component fails the typecheck.
 */
function page<K extends string, M extends Record<K, ComponentType>>(
  load: () => Promise<M>,
  name: K,
): () => Promise<{ Component: ComponentType }> {
  // eslint-disable-next-line security/detect-object-injection -- an export name the type checks
  return async () => ({ Component: (await withRest(load()))[name] });
}

/**
 * Every screen of the PWA: the sign-in pages alone, every signed-in page inside the app shell.
 * Only the login is in the first load; every other screen, the shell too, is its own chunk, so the
 * first route stays within the JavaScript budget of docs/NON_FUNCTIONAL_REQUIREMENTS.md. Every lazy
 * screen loads through `page`, so it renders only once the rest of the catalogue is in too
 * (docs/ui/I18N.md, "Typed keys and loading"); the login uses the start part alone.
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
          lazy: page(() => import('../features/auth/ResetPage'), 'ResetPage'),
        },
        {
          path: '/invite',
          lazy: page(() => import('../features/auth/InvitePage'), 'InvitePage'),
        },
        {
          path: '/apply/:token',
          lazy: page(() => import('../features/forms/PublicApplyPage'), 'PublicApplyPage'),
        },
        {
          path: '/register',
          lazy: page(() => import('../features/registration/RegisterPage'), 'RegisterPage'),
        },
        {
          lazy: page(() => import('../components/shell/AppShell'), 'AppShell'),
          children: [
            {
              path: '/',
              lazy: page(() => import('../features/home/MyWorkPage'), 'MyWorkPage'),
            },
            {
              path: '/account/profile',
              lazy: page(() => import('../features/account/ProfileView'), 'ProfileView'),
            },
            {
              path: '/account/sessions',
              lazy: page(() => import('../features/account/SessionsView'), 'SessionsView'),
            },
            {
              path: '/account/exports',
              lazy: page(() => import('../features/exports/MyExportsPage'), 'MyExportsPage'),
            },
            {
              path: '/account/password',
              lazy: page(
                () => import('../features/account/ChangePasswordView'),
                'ChangePasswordView',
              ),
            },
            {
              path: '/notifications',
              lazy: page(
                () => import('../features/notifications/NotificationsPage'),
                'NotificationsPage',
              ),
            },
            // the volunteer's own projects load with their own chunk, like the admin pages
            {
              path: '/my-projects',
              lazy: page(() => import('../features/projects/MyProjectsPage'), 'MyProjectsPage'),
            },
            {
              path: '/my-projects/:projectId',
              lazy: page(() => import('../features/projects/MyProjectPage'), 'MyProjectPage'),
            },
            {
              path: '/my-projects/:projectId/team',
              lazy: page(() => import('../features/projects/TeamPage'), 'TeamPage'),
            },
            {
              path: '/my-projects/:projectId/apply',
              lazy: page(
                () => import('../features/applications/ApplicationFormPage'),
                'ApplicationFormPage',
              ),
            },
            {
              path: '/my-applications',
              lazy: page(
                () => import('../features/applications/MyApplicationsPage'),
                'MyApplicationsPage',
              ),
            },
            {
              path: '/my-applications/:applicationId',
              lazy: page(
                () => import('../features/applications/ApplicationDetailPage'),
                'ApplicationDetailPage',
              ),
            },
            {
              path: '/my-applications/:applicationId/edit',
              lazy: page(
                () => import('../features/applications/ApplicationFormPage'),
                'ApplicationFormPage',
              ),
            },
            {
              path: '/sync',
              lazy: page(() => import('../features/sync/SyncCentrePage'), 'SyncCentrePage'),
            },
            // the Media Team's screens are their own chunks, like the volunteer's pages
            {
              path: '/media',
              lazy: page(() => import('../features/media/MediaHomePage'), 'MediaHomePage'),
            },
            {
              path: '/media/referrals/:referralId',
              lazy: page(() => import('../features/media/WorkPage'), 'WorkPage'),
            },
            {
              path: '/media/members/:userId',
              lazy: page(() => import('../features/media/MemberPage'), 'MemberPage'),
            },
            {
              // The admin area is its own chunk: the other screens never load it.
              path: '/admin',
              lazy: page(() => import('../admin/AdminLayout'), 'AdminLayout'),
              children: [
                // My Work is the home of the officials too
                { index: true, element: <Navigate to="/" replace /> },
                // the programs moved into the programs and projects tab
                { path: 'programs', element: <Navigate to="/admin/projects" replace /> },
                {
                  path: 'templates',
                  lazy: page(() => import('../admin/templates/TemplatesPage'), 'TemplatesPage'),
                },
                {
                  path: 'ready-forms',
                  lazy: page(() => import('../admin/forms/ReadyFormsPage'), 'ReadyFormsPage'),
                },
                {
                  path: 'ready-forms/:formId',
                  lazy: page(
                    () => import('../admin/forms/FormBuilderPage'),
                    'ReadyFormBuilderPage',
                  ),
                },
                {
                  path: 'question-library',
                  lazy: page(() => import('../admin/forms/FormBuilderPage'), 'LibraryBuilderPage'),
                },
                {
                  path: 'projects',
                  // officials use the tab on a phone as on a computer: no "larger screen" notice
                  handle: { phoneReady: true } satisfies AdminRouteHandle,
                  lazy: page(
                    () => import('../admin/projects/ProgramsProjectsPage'),
                    'ProgramsProjectsPage',
                  ),
                },
                {
                  path: 'projects/programs/:programId',
                  handle: { phoneReady: true } satisfies AdminRouteHandle,
                  lazy: page(() => import('../admin/projects/ProgramPage'), 'ProgramPage'),
                },
                {
                  path: 'projects/series/:seriesId',
                  handle: { phoneReady: true } satisfies AdminRouteHandle,
                  lazy: page(
                    () => import('../admin/projects/ProjectSeriesPage'),
                    'ProjectSeriesPage',
                  ),
                },
                {
                  path: 'projects/new',
                  lazy: page(
                    () => import('../admin/projects/setup/ProjectSetupPage'),
                    'ProjectSetupPage',
                  ),
                },
                {
                  path: 'projects/:projectId',
                  lazy: page(
                    () => import('../admin/projects/ProjectOverviewPage'),
                    'ProjectOverviewPage',
                  ),
                },
                {
                  path: 'projects/:projectId/setup',
                  lazy: page(
                    () => import('../admin/projects/setup/ProjectSetupPage'),
                    'ProjectSetupPage',
                  ),
                },
                {
                  path: 'projects/:projectId/applications',
                  lazy: page(
                    () => import('../admin/applications/ApplicationsPage'),
                    'ApplicationsPage',
                  ),
                },
                {
                  path: 'applications/:applicationId',
                  lazy: page(
                    () => import('../admin/applications/ApplicationReviewPage'),
                    'ApplicationReviewPage',
                  ),
                },
                {
                  path: 'projects/:projectId/forms',
                  lazy: page(() => import('../admin/forms/FormsPage'), 'FormsPage'),
                },
                {
                  path: 'projects/:projectId/forms/:formId',
                  lazy: page(() => import('../admin/forms/FormBuilderPage'), 'FormBuilderPage'),
                },
                {
                  path: 'projects/:projectId/volunteers',
                  lazy: page(
                    () => import('../admin/projects/volunteers/ProjectVolunteersPage'),
                    'ProjectVolunteersPage',
                  ),
                },
                {
                  path: 'projects/:projectId/transfer',
                  lazy: page(
                    () => import('../admin/projects/volunteers/TransferPage'),
                    'TransferPage',
                  ),
                },
                {
                  path: 'volunteers',
                  lazy: page(() => import('../admin/volunteers/VolunteersPage'), 'VolunteersPage'),
                },
                {
                  path: 'volunteers/:volunteerId',
                  lazy: page(
                    () => import('../admin/volunteers/VolunteerProfilePage'),
                    'VolunteerProfilePage',
                  ),
                },
                {
                  path: 'beneficiaries',
                  lazy: page(
                    () => import('../admin/beneficiaries/BeneficiariesPage'),
                    'BeneficiariesPage',
                  ),
                },
                {
                  path: 'beneficiaries/duplicates',
                  lazy: page(
                    () => import('../admin/beneficiaries/duplicates/DuplicatesPage'),
                    'DuplicatesPage',
                  ),
                },
                {
                  path: 'beneficiaries/duplicates/compare',
                  lazy: page(
                    () => import('../admin/beneficiaries/duplicates/ComparePage'),
                    'ComparePage',
                  ),
                },
                {
                  path: 'beneficiaries/:beneficiaryId',
                  lazy: page(
                    () => import('../admin/beneficiaries/BeneficiaryProfilePage'),
                    'BeneficiaryProfilePage',
                  ),
                },
                {
                  path: 'registrations',
                  lazy: page(
                    () => import('../admin/registrations/RegistrationsPage'),
                    'RegistrationsPage',
                  ),
                },
                {
                  path: 'registrations/:userId',
                  lazy: page(
                    () => import('../admin/registrations/RegistrationDetail'),
                    'RegistrationDetail',
                  ),
                },
                {
                  path: 'staff',
                  lazy: page(() => import('../admin/staff/StaffPage'), 'StaffPage'),
                },
                {
                  path: 'staff/:userId',
                  lazy: page(() => import('../admin/staff/StaffProfilePage'), 'StaffProfilePage'),
                },
                {
                  path: 'staff/organogram',
                  lazy: page(() => import('../admin/staff/OrganogramPage'), 'OrganogramPage'),
                },
                {
                  path: 'settings',
                  lazy: page(() => import('../admin/settings/SettingsPage'), 'SettingsPage'),
                },
                {
                  path: 'nisab',
                  lazy: page(() => import('../admin/nisab/NisabPage'), 'NisabPage'),
                },
                {
                  path: 'audit',
                  lazy: page(() => import('../admin/audit/AuditPage'), 'AuditPage'),
                },
                {
                  path: 'sessions',
                  lazy: page(() => import('../admin/system/SessionsPage'), 'SessionsPage'),
                },
                {
                  path: 'health',
                  lazy: page(() => import('../admin/system/HealthPage'), 'HealthPage'),
                },
                {
                  path: 'notification-templates',
                  lazy: page(
                    () => import('../admin/notifications/NotificationTemplatesPage'),
                    'NotificationTemplatesPage',
                  ),
                },
                {
                  path: 'deliveries',
                  lazy: page(
                    () => import('../admin/notifications/DeliveriesPage'),
                    'DeliveriesPage',
                  ),
                },
                {
                  path: 'handover',
                  lazy: page(() => import('../admin/handover/HandoverPage'), 'HandoverPage'),
                },
                {
                  path: 'permissions',
                  lazy: page(
                    () => import('../admin/permissions/PermissionsPage'),
                    'PermissionsPage',
                  ),
                },
              ],
            },
          ],
        },
        ...(gallery && AsfGalleryPage
          ? [
              {
                path: '/dev/asf',
                element: (
                  <Suspense fallback={null}>
                    <AsfGalleryPage />
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
