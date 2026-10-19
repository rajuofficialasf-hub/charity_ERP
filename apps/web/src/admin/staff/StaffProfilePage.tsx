import type { InvitationIssued } from '@css/shared/auth';
import { formatDateTime } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  type ContactItem,
  ContactList,
  DescriptionList,
  EmptyState,
  ErrorState,
  Grid,
  type ProfileFact,
  ProfileHeader,
  ProfileSection,
  Skeleton,
  Text,
} from '@css/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  IdCard,
  KeyRound,
  Link2,
  Mail,
  MonitorSmartphone,
  Pencil,
  Phone,
  UserX,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { useLocationName } from '../../components/AddressNames';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { mailLink, telLink } from '../contact-links';
import { PROGRAMS_KEY, programs } from '../programs/programs-api';
import { roles } from '../registrations/registrations-api';
import { canEndSessions, canManageOfficials, canSeeStaff } from '../roles';
import { VolunteerSessions } from '../volunteers/VolunteerSessions';
import { LinkDialog } from './LinkDialog';
import { OfficialDialog } from './OfficialDialog';
import { RenewLinkDialog } from './RenewLinkDialog';
import { STAFF_KEY, type StaffDetail, staffDetail, staffDetailKey } from './staff-api';

/**
 * One official's profile (UX-22) from the existing user API: the header card with the Job ID and
 * the contact, the role and place, the account and the devices. Editing the profile and a new
 * set-password link are for the Department Head and the Monitoring Team; the devices for those who
 * may end another person's sessions. The server checks every read and action again.
 */
export function StaffProfilePage() {
  const { me } = useAuth();
  const { userId = '' } = useParams();
  const t = useTranslations('admin.staff.profile');
  const tc = useTranslations('common');
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
  if (official.error instanceof ApiFailure && official.error.status === 404)
    return (
      <>
        {back}
        <EmptyState icon={UserX} title={t('not_found')} />
      </>
    );
  if (official.error || !official.data)
    return (
      <>
        {back}
        <ErrorState
          title={tc('state.error.text')}
          requestId={official.error instanceof ApiFailure ? official.error.requestId : undefined}
          onRetry={() => void official.refetch()}
        />
      </>
    );
  return (
    <Profile
      official={official.data}
      manage={canManageOfficials(me)}
      sessions={canEndSessions(me)}
    />
  );
}

function Profile({
  official: u,
  manage,
  sessions,
}: {
  official: StaffDetail;
  manage: boolean;
  sessions: boolean;
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
  const division = useLocationName(undefined, u.homeDivisionId);
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
            icon: IdCard,
            showLabel: true,
            copy: true,
          },
        ]
      : []),
    ...(u.designation
      ? [{ id: 'designation', label: td('designation'), value: u.designation, icon: Briefcase }]
      : []),
    ...(u.mobile
      ? [{ id: 'mobile', label: td('mobile'), value: u.mobile, icon: Phone, copy: true }]
      : []),
    ...(u.email
      ? [{ id: 'email', label: td('email'), value: u.email, icon: Mail, copy: true }]
      : []),
  ];
  const contacts: ContactItem[] = [
    ...(u.mobile
      ? [
          {
            id: 'mobile',
            icon: Phone,
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
            icon: Mail,
            label: td('email'),
            value: u.email,
            href: mailLink(u.email),
            actionLabel: t('send_email'),
          },
        ]
      : []),
  ];
  const stateBadge = u.awaitingPassword ? (
    <Badge variant="dot" tone="warning" label={ts('state.awaiting')} />
  ) : (
    <Badge
      variant="dot"
      tone={u.state === 'active' ? 'success' : 'warning'}
      label={ts(`state.${u.state}`)}
    />
  );

  return (
    <Grid gap={4}>
      <DocumentTitle title={u.displayName} />
      <Breadcrumb
        items={[
          { id: 'list', label: t('back'), href: '/admin/staff' },
          { id: 'profile', label: u.displayName },
        ]}
      />
      <ProfileHeader
        name={u.displayName}
        avatar={<Avatar name={u.displayName} letters={1} size="lg" />}
        status={
          <>
            {u.affiliation && <Badge label={ts(`affiliation.${u.affiliation}`)} />}
            {stateBadge}
            {u.isSystemOwner && <Badge tone="info" label={t('system_owner')} />}
          </>
        }
        facts={facts}
        actions={
          manage ? (
            <>
              <Button icon={Pencil} onPress={() => setDialog('edit')}>
                {t('edit')}
              </Button>
              {u.awaitingPassword && (
                <Button variant="secondary" icon={Link2} onPress={() => setDialog('renew')}>
                  {t('renew')}
                </Button>
              )}
            </>
          ) : undefined
        }
        actionsLabel={t('actions_label')}
      />
      {notice && (
        <Alert tone="success" live="status" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      <div className="admin-profile-grid">
        <Grid gap={3}>
          <ProfileSection title={t('sections.identity')} icon={IdCard}>
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
          <ProfileSection title={t('sections.place')} icon={Briefcase}>
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
                { label: td('division'), value: division?.[locale] ?? none },
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
          <ProfileSection title={t('sections.account')} icon={KeyRound}>
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
        </Grid>
        <Grid gap={3} as="aside">
          <ProfileSection title={t('sections.contact')} icon={Phone}>
            {contacts.length > 0 ? <ContactList items={contacts} /> : <Text>{none}</Text>}
          </ProfileSection>
          {sessions && (
            <ProfileSection title={t('sections.devices')} icon={MonitorSmartphone}>
              <VolunteerSessions userId={u.id} canRevoke />
            </ProfileSection>
          )}
        </Grid>
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
    </Grid>
  );
}
