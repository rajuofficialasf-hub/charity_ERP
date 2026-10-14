import { Alert, Button, Card, EmptyState, ErrorState, Skeleton } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Briefcase,
  GraduationCap,
  Image,
  Landmark,
  MapPin,
  PencilLine,
  Phone,
  Sparkles,
  User,
} from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { Corrections } from './ChangeRequests';
import { EditSection } from './EditSection';
import { DetailRow, hasValue, LEGACY_FIELDS, type ProfileField } from './ProfileDetails';
import { ProfileHeader } from './ProfileHeader';
import { ProfileNav } from './ProfileNav';
import { ownProfile, ownRequests, PROFILE_KEY, REQUESTS_KEY } from './profile-api';
import './profile.css';

/** The own details by section (UX-18); the type decides the role, so it can not be requested. */
const SECTIONS = [
  {
    key: 'personal',
    icon: User,
    fields: [
      'name',
      'fatherName',
      'motherName',
      'nid',
      'dateOfBirth',
      'bloodGroup',
      'tshirtSize',
      'facebookId',
    ],
  },
  { key: 'contact', icon: Phone, fields: ['mobile', 'email', 'whatsapp'] },
  {
    key: 'address',
    icon: MapPin,
    fields: ['address', 'addressLine', 'permanentAddress', 'volunteeringArea'],
  },
  { key: 'education', icon: GraduationCap, fields: ['educationDetails', 'education'] },
  {
    key: 'work',
    icon: Briefcase,
    fields: ['type', 'profession', 'previousProjects', 'experience', 'workDescription'],
  },
  { key: 'skills', icon: Sparkles, fields: ['skills'] },
  { key: 'bank', icon: Landmark, fields: ['bank'] },
  { key: 'photos', icon: Image, fields: ['photo', 'nid_photo', 'nid_photo_back'] },
] as const satisfies readonly { key: string; icon: unknown; fields: readonly ProfileField[] }[];

/**
 * The volunteer's own profile (SCR-006, SCR-003; BR-030, BR-031 as amended by DECISION_LOG D-085;
 * plans docs/plans/2026-10-13-0922-feat-registration-redesign-plan.md and
 * docs/plans/2026-10-13-1500-feat-profile-redesign-plan.md): a header with the person, the
 * sections as a navigation and one section's details at a time; after approval one edit button
 * starts the edit mode of the open section. A pending registrant sees the requested corrections
 * above the details.
 */
export function ProfileView() {
  const t = useTranslations('registration.profile');
  return (
    <AccountPage title={() => t('title')} wide>
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
  const [current, setCurrent] = useState<(typeof SECTIONS)[number]['key']>('personal');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const titleId = useId();
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
  const rows = requests.data;
  const active = me.state === 'active';
  const section = SECTIONS.find((s) => s.key === current)!;
  // the earlier work texts only for a volunteer who has them
  const fieldsOf = section.fields.filter((f) => !LEGACY_FIELDS.includes(f) || hasValue(me, f));
  const title = t(`profile.sections.${section.key}`);
  const edits = (rows ?? []).filter(
    (r) => r.kind === 'profile_edit' && ['open', 'submitted'].includes(r.status),
  );
  const waiting = new Set(
    SECTIONS.filter((s) =>
      edits.some((r) => r.status === 'open' && (s.fields as readonly string[]).includes(r.field)),
    ).map((s) => s.key),
  );
  return (
    <div className="profile">
      {me.state === 'pending' && (
        <Alert tone="info" live="status">
          {t('profile.pending')}
        </Alert>
      )}
      {!me.inAnyProject && <Alert tone="info">{t('profile.no_project')}</Alert>}
      {/* a failed list is an error, never "nothing to do" */}
      {requests.error && (
        <ErrorState
          title={tc('state.error.text')}
          onRetry={() => void requests.refetch()}
          requestId={requests.error instanceof ApiFailure ? requests.error.requestId : undefined}
        />
      )}
      {notice && (
        <Alert tone="success" live="status" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {rows && me.state === 'pending' && <Corrections requests={rows} />}
      <ProfileHeader me={me} />
      <div className="profile-layout">
        <ProfileNav
          sections={SECTIONS.map((s) => ({
            key: s.key,
            icon: s.icon,
            title: t(`profile.sections.${s.key}`),
          }))}
          current={current}
          waiting={waiting}
          busy={busy}
          onSelect={(key) => {
            setCurrent(key);
            setEditing(false);
          }}
        />
        <Card>
          <section aria-labelledby={titleId} className="profile-section">
            <div className="profile-section-head">
              <h2 id={titleId} className="profile-section-title">
                {title}
              </h2>
              {active && rows !== undefined && !editing && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={PencilLine}
                  aria-label={t('profile.edit.button_label', { field: title })}
                  onPress={() => {
                    setNotice(null);
                    setEditing(true);
                  }}
                >
                  {t('profile.edit.button')}
                </Button>
              )}
            </div>
            {editing && rows ? (
              <EditSection
                key={section.key}
                me={me}
                title={title}
                fields={fieldsOf}
                edits={edits}
                onBusy={setBusy}
                onCancel={() => setEditing(false)}
                onSent={() => {
                  setEditing(false);
                  setNotice(t('profile.edit.sent'));
                }}
              />
            ) : (
              <dl className="profile-list">
                {fieldsOf.map((field) => (
                  <DetailRow
                    key={field}
                    me={me}
                    field={field}
                    request={field === 'type' ? undefined : edits.find((r) => r.field === field)}
                  />
                ))}
              </dl>
            )}
          </section>
        </Card>
      </div>
    </div>
  );
}
