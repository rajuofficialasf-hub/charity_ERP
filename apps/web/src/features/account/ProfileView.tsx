import { Alert, Card, EmptyState, ErrorState, Skeleton } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { Corrections, EditRequests } from './ChangeRequests';
import { ownProfile, ownRequests, type OwnProfile, PROFILE_KEY, REQUESTS_KEY } from './profile-api';

/**
 * The volunteer's own profile (SCR-003, BR-031; plan
 * docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, R6, R8, R10, R11, R18):
 * the own details in full (D-081), the "no project yet" message, the correction requests of a
 * pending registration and, after approval, the edit requests.
 */
export function ProfileView() {
  const t = useTranslations('registration.profile');
  return (
    <AccountPage title={() => t('title')}>
      {() => (
        <>
          <DocumentTitle title={t('title')} />
          <Profile />
        </>
      )}
    </AccountPage>
  );
}

function Profile() {
  const t = useTranslations('registration');
  const tc = useTranslations('common');
  const profile = useQuery({ queryKey: PROFILE_KEY, queryFn: ownProfile, retry: false });
  const requests = useQuery({ queryKey: REQUESTS_KEY, queryFn: ownRequests });
  if (profile.isPending) return <Skeleton count={3} />;
  if (profile.error instanceof ApiFailure && profile.error.status === 404)
    return <EmptyState title={t('profile.not_volunteer')} />;
  if (profile.error || !profile.data)
    return (
      <ErrorState
        title={tc('state.error.text')}
        onRetry={() => void profile.refetch()}
        requestId={profile.error instanceof ApiFailure ? profile.error.requestId : undefined}
      />
    );
  const me = profile.data;
  const rows = requests.data ?? [];
  return (
    <div className="flex flex-col gap-6">
      {me.state === 'pending' && (
        <Alert tone="info" live="status">
          {t('profile.pending')}
        </Alert>
      )}
      {!me.inAnyProject && <Alert tone="info">{t('profile.no_project')}</Alert>}
      {me.state === 'pending' ? <Corrections requests={rows} /> : null}
      <Details me={me} />
      {me.state === 'active' && <EditRequests requests={rows} />}
    </div>
  );
}

function Details({ me }: { me: OwnProfile }) {
  const t = useTranslations('registration');
  const bank = [me.bank.bankName, me.bank.accountName, me.bank.accountNumber, me.bank.routingNumber]
    .filter(Boolean)
    .join(', ');
  const rows: [string, string | null][] = [
    [t('form.name'), me.displayName],
    [t('form.father_name'), me.fatherName],
    [t('form.mother_name'), me.motherName],
    [t('form.nid'), me.nid],
    [t('start.mobile'), me.mobile],
    [t('start.email'), me.email],
    [t('form.whatsapp'), me.whatsapp],
    [t('form.type'), t(`form.types.${me.type as 'general'}`)],
    [t('form.address_line'), me.addressLine],
    [t('form.education'), me.education],
    [t('form.experience'), me.experience],
    [t('form.work_description'), me.workDescription],
    [t('form.previous_projects'), me.previousProjects],
    [t('form.facebook'), me.facebookId],
    [t('form.bank'), bank || null],
  ];
  return (
    <Card>
      <h2 className="mt-0">{t('profile.details')}</h2>
      <dl className="grid gap-2 sm:grid-cols-[12rem_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-bold">{label}</dt>
            <dd className="m-0">{value ?? t('profile.empty')}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
