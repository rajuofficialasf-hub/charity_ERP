import type { InvitationIssued } from '@css/shared/auth';
import { formatDateTime } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Chip,
  ContactList,
  DescriptionList,
  EmptyState,
  ProfileSection,
  Skeleton,
  Stack,
  Text,
  type ContactItem,
  type ProfileFact,
} from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../api/client';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { mailLink, telLink } from '../contact-links';
import { PROGRAMS_KEY, programs } from '../programs/programs-api';
import { roles } from '../registrations/registrations-api';
import {
  canEndStaffSessions,
  canGiveWholeCountry,
  canManageExtraAreas,
  canManageOfficials,
  canSeeProjects,
  canSeeStaff,
  canSeeStaffWork,
} from '../roles';
import { VolunteerSessions } from '../volunteers/VolunteerSessions';
import { ExtraAreas } from './ExtraAreas';
import { LinkDialog } from './LinkDialog';
import { OfficialDialog } from './OfficialDialog';
import { RenewLinkDialog } from './RenewLinkDialog';
import { STAFF_KEY, type StaffDetail, staffDetail, staffDetailKey } from './staff-api';
import { PageCrumbs } from '../../components/shell/breadcrumb';
import { PersonBanner } from '../../components/PersonPhoto';
import { ProjectsWork } from '../../features/account/ProjectsWork';
import { projectsWorkOf } from '../../features/account/profile-api';
import { LoadError } from '../../components/LoadError';

/**
 * One official's profile in the one profile layout, from the existing user API: the header card with the Job ID and
 * the contact, the role and place, the extra areas, the account and the devices. Editing the profile and a new
 * set-password link are for the Department Head and the Monitoring Team; the devices for those who
 * may end another person's sessions. The server checks every read and action again.
 */
export function StaffProfilePage() {
  const { me } = useAuth();
  const { userId = '' } = useParams();
  const t = useTranslations('admin.staff.profile');
  const allowed = Boolean(me && canSeeStaff(me));
  const official = useQuery({
    queryKey: staffDetailKey(userId),
    queryFn: () => staffDetail(userId),
    retry: false,
    enabled: allowed,
  });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;
  const back = (
    <div>
      <Link to="/admin/staff">{t('back')}</Link>
    </div>
  );
  if (official.isPending) return <Skeleton count={4} />;
  // a volunteer's id answers too, but is not an official: the same as not found
  if (
    (official.error instanceof ApiFailure && official.error.status === 404) ||
    (official.data && official.data.kind !== 'staff')
  )
    return (
      <>
        {back}
        <EmptyState title={t('not_found')} />
      </>
    );
  if (official.error || !official.data)
    return (
      <>
        {back}
        <LoadError error={official.error} onRetry={() => void official.refetch()} />
      </>
    );
  return (
    <Profile
      official={official.data}
      manage={canManageOfficials(me)}
      sessions={canEndStaffSessions(me)}
      work={canSeeStaffWork(me)}
      projectLinks={canSeeProjects(me)}
      extraAreas={
        canManageExtraAreas(me)
          ? // nobody gives an area to themselves
            { manage: me.id !== userId, wholeCountry: canGiveWholeCountry(me) }
          : null
      }
    />
  );
}

function Profile({
  official: u,
  manage,
  sessions,
  work,
  projectLinks,
  extraAreas,
}: {
  official: StaffDetail;
  manage: boolean;
  sessions: boolean;
  /** The viewer may see the official's projects and the figures of their work. */
  work: boolean;
  projectLinks: boolean;
  /** The viewer reads the official's extra areas, and whether they may change them here. */
  extraAreas: { manage: boolean; wholeCountry: boolean } | null;
}) {
  const t = useTranslations('admin.staff.profile');
  const ts = useTranslations('admin.staff');
  const td = useTranslations('admin.staff.dialog');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'edit' | 'renew' | null>(null);
  const [link, setLink] = useState<InvitationIssued | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const programList = useQuery({ queryKey: PROGRAMS_KEY, queryFn: programs });
  const roleList = useQuery({ queryKey: ['admin', 'roles'], queryFn: roles });
  const supervisor = useQuery({
    queryKey: staffDetailKey(u.supervisorUserId ?? ''),
    queryFn: () => staffDetail(u.supervisorUserId!),
    enabled: u.supervisorUserId !== null,
    retry: false,
  });
  const none = t('none');
  const roleName = (key: string) => {
    const role = roleList.data?.find((r) => r.key === key);
    return role ? localized(role.name, locale) : key;
  };
  const program = u.homeProgramId
    ? programList.data?.find((p) => p.id === u.homeProgramId)
    : undefined;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: STAFF_KEY });

  const facts: ProfileFact[] = [
    ...(u.jobId
      ? [
          {
            id: 'job',
            label: ts('column.job_id'),
            value: u.jobId,
            icon: 'id-card' as const,
            showLabel: true,
            copy: true,
          },
        ]
      : []),
    ...(u.designation
      ? [
          {
            id: 'designation',
            label: td('designation'),
            value: u.designation,
            icon: 'briefcase' as const,
          },
        ]
      : []),
    ...(u.mobile
      ? [{ id: 'mobile', label: td('mobile'), value: u.mobile, icon: 'phone' as const, copy: true }]
      : []),
    ...(u.email
      ? [{ id: 'email', label: td('email'), value: u.email, icon: 'mail' as const, copy: true }]
      : []),
  ];
  const contacts: ContactItem[] = [
    ...(u.mobile
      ? [
          {
            id: 'mobile',
            icon: 'phone' as const,
            label: td('mobile'),
            value: u.mobile,
            href: telLink(u.mobile),
            actionLabel: t('call'),
          },
        ]
      : []),
    ...(u.email
      ? [
          {
            id: 'email',
            icon: 'mail' as const,
            label: td('email'),
            value: u.email,
            href: mailLink(u.email),
            actionLabel: t('send_email'),
          },
        ]
      : []),
  ];
  const stateBadge = u.awaitingPassword ? (
    <Chip tone="warning">{ts('state.awaiting')}</Chip>
  ) : (
    <Chip tone={u.state === 'active' ? 'success' : 'warning'}>{ts(`state.${u.state}`)}</Chip>
  );

  return (
    <Stack gap={4}>
      <DocumentTitle title={u.displayName} />
      <PageCrumbs
        items={[
          { id: 'list', label: t('back'), href: '/admin/staff' },
          { id: 'profile', label: u.displayName },
        ]}
      />
      <PersonBanner
        name={u.displayName}
        fileId={u.photoFileId}
        status={
          <>
            {u.affiliation && <Chip>{ts(`affiliation.${u.affiliation}`)}</Chip>}
            {stateBadge}
            {u.isSystemOwner && <Chip tone="info">{t('system_owner')}</Chip>}
          </>
        }
        facts={facts}
        actions={
          manage ? (
            <>
              <Button startIcon="edit" onClick={() => setDialog('edit')}>
                {t('edit')}
              </Button>
              {u.awaitingPassword && (
                <Button variant="secondary" startIcon="link" onClick={() => setDialog('renew')}>
                  {t('renew')}
                </Button>
              )}
            </>
          ) : undefined
        }
        actionsLabel={t('actions_label')}
      />
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      <div className="admin-profile-grid">
        <Stack gap={3}>
          <ProfileSection title={t('sections.identity')} icon="id-card">
            <DescriptionList
              columns={2}
              items={[
                { label: td('name'), value: u.displayName },
                {
                  label: ts('column.job_id'),
                  value: u.jobId ? <span lang="en">{u.jobId}</span> : ts('no_job_id'),
                },
                { label: td('designation'), value: u.designation ?? none },
                { label: td('mobile'), value: u.mobile ?? none },
                { label: td('email'), value: u.email ?? none },
              ]}
            />
          </ProfileSection>
          <ProfileSection title={t('sections.place')} icon="briefcase">
            <DescriptionList
              columns={2}
              items={[
                {
                  label: td('affiliation'),
                  value: u.affiliation ? ts(`affiliation.${u.affiliation}`) : none,
                },
                ...(u.affiliation && u.affiliation !== 'department'
                  ? [
                      {
                        label: td(
                          u.affiliation === 'foundation' ? 'unit_foundation' : 'unit_external',
                        ),
                        value: u.affiliationUnit ?? none,
                      },
                    ]
                  : []),
                {
                  label: td('program'),
                  value: program ? localized(program.name, locale) : none,
                },
                {
                  label: td('supervisor'),
                  value: supervisor.data ? (
                    <Link to={`/admin/staff/${supervisor.data.id}`}>
                      {supervisor.data.displayName}
                    </Link>
                  ) : (
                    none
                  ),
                },
                {
                  label: td('role'),
                  value: u.roles.length > 0 ? u.roles.map(roleName).join(', ') : none,
                },
              ]}
            />
          </ProfileSection>
          {extraAreas && <ExtraAreas userId={u.id} name={u.displayName} {...extraAreas} />}
          {work && <WorkSection userId={u.id} projectLinks={projectLinks} />}
          <ProfileSection title={t('sections.account')} icon="key">
            <DescriptionList
              items={[
                { label: t('state'), value: stateBadge },
                {
                  label: t('last_login'),
                  value: u.lastLoginAt ? formatDateTime(u.lastLoginAt, locale) : t('never'),
                },
              ]}
            />
          </ProfileSection>
        </Stack>
        <aside className="admin-profile-side">
          <ProfileSection title={t('sections.contact')} icon="phone">
            {contacts.length > 0 ? <ContactList items={contacts} /> : <Text>{none}</Text>}
          </ProfileSection>
          {sessions && (
            <ProfileSection title={t('sections.devices')} icon="devices">
              <VolunteerSessions userId={u.id} canRevoke />
            </ProfileSection>
          )}
        </aside>
      </div>

      {dialog === 'edit' && (
        <OfficialDialog
          official={u}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            setNotice(ts('notice.saved', { name: saved.displayName }));
            refresh();
          }}
        />
      )}
      {dialog === 'renew' && (
        <RenewLinkDialog
          official={u}
          onClose={() => setDialog(null)}
          onDone={(issued) => {
            setDialog(null);
            setLink(issued);
            refresh();
          }}
        />
      )}
      {link && <LinkDialog name={u.displayName} issued={link} onClose={() => setLink(null)} />}
    </Stack>
  );
}

/**
 * The official's projects by year with the figures of their work, for the two global roles and the
 * official's Program Manager; a PM outside the official's programs is answered "not found", and
 * the section is left out.
 */
function WorkSection({ userId, projectLinks }: { userId: string; projectLinks: boolean }) {
  const t = useTranslations('admin.staff.profile');
  const work = useQuery({
    queryKey: ['admin', 'staff', userId, 'projects-work'],
    queryFn: () => projectsWorkOf(userId),
    retry: false,
  });
  if (work.error instanceof ApiFailure && [403, 404].includes(work.error.status)) return null;
  return (
    <ProfileSection title={t('sections.work')} icon="project">
      <ProjectsWork query={work} own={false} projectLinks={projectLinks} />
    </ProfileSection>
  );
}
