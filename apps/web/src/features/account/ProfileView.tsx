import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  type ExtendedIconName,
  Skeleton,
} from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoadError } from '../../components/LoadError';
import { ApiFailure } from '../../api/client';
import { useAuth } from '../../lib/auth';
import { Corrections } from './ChangeRequests';
import { EditSection } from './EditSection';
import { OfficialProfile } from './OfficialProfile';
import { DetailRow, hasValue, LEGACY_FIELDS, type ProfileField } from './ProfileDetails';
import { ProfileHeader } from './ProfileHeader';
import { ProfileNav } from './ProfileNav';
import { ownProfile, ownRequests, PROFILE_KEY, REQUESTS_KEY } from './profile-api';
import './profile.css';

/** The own details by section; the type decides the role, so it can not be requested. */
const SECTIONS = [
  {
    key: 'personal',
    icon: 'user',
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
  { key: 'contact', icon: 'phone', fields: ['mobile', 'email', 'whatsapp'] },
  {
    key: 'address',
    icon: 'map-pin',
    fields: ['address', 'addressLine', 'permanentAddress', 'volunteeringArea'],
  },
  { key: 'education', icon: 'education', fields: ['educationDetails', 'education'] },
  {
    key: 'work',
    icon: 'briefcase',
    fields: ['type', 'profession', 'previousProjects', 'experience', 'workDescription'],
  },
  { key: 'skills', icon: 'sparkles', fields: ['skills'] },
  { key: 'bank', icon: 'building', fields: ['bank'] },
  { key: 'photos', icon: 'gallery', fields: ['photo', 'nid_photo', 'nid_photo_back'] },
] as const satisfies readonly {
  key: string;
  icon: ExtendedIconName;
  fields: readonly ProfileField[];
}[];

/**
 * The volunteer's own profile (docs/ui/SCREENS.md, "My profile"): a header with the person, the
 * sections as a navigation and one section's details at a time; after approval one edit button
 * starts the edit mode of the open section. A pending registrant sees the requested corrections
 * above the details.
 */
export function ProfileView() {
  const t = useTranslations('registration.profile');
  const { me } = useAuth();
  // an official's own profile has its own sections (the official's own profile of 2026-11-02)
  const official = me?.kind === 'staff';
  return (
    <AccountPage
      title={() => t('title')}
      eyebrow={t('eyebrow')}
      description={official ? t('official.description') : t('description')}
      wide
    >
      {() => (
        <>
          <DocumentTitle title={t('title')} />
          {official ? <OfficialProfile /> : <Profile />}
        </>
      )}
    </AccountPage>
  );
}

function Profile() {
  const t = useTranslations('registration');
  const profile = useQuery({ queryKey: PROFILE_KEY, queryFn: ownProfile, retry: false });
  const requests = useQuery({ queryKey: REQUESTS_KEY, queryFn: ownRequests });
  const [current, setCurrent] = useState<(typeof SECTIONS)[number]['key']>('personal');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  // something is ticked in the edit mode; another section asks before it opens
  const [dirty, setDirty] = useState(false);
  const [leaving, setLeaving] = useState<(typeof SECTIONS)[number]['key'] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const titleId = useId();
  // the profile is read again (a permission change): the edit mode and its question start over
  const [wasPending, setWasPending] = useState(profile.isPending);
  if (profile.isPending !== wasPending) {
    setWasPending(profile.isPending);
    if (profile.isPending) {
      setEditing(false);
      setLeaving(null);
    }
  }
  if (profile.isPending) return <Skeleton count={3} />;
  if (profile.error instanceof ApiFailure && profile.error.status === 404)
    return <EmptyState title={t('profile.not_volunteer')} />;
  if (profile.error || !profile.data)
    return <LoadError error={profile.error} onRetry={() => void profile.refetch()} />;
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
      {me.state === 'pending' && <Alert tone="info">{t('profile.pending')}</Alert>}
      {!me.inAnyProject && <Alert tone="info">{t('profile.no_project')}</Alert>}
      {/* a failed list is an error, never "nothing to do" */}
      {requests.error && (
        <LoadError error={requests.error} onRetry={() => void requests.refetch()} />
      )}
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
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
            // ticked details are never dropped without a question; the open section stays as it is
            if (editing && dirty) {
              if (key !== current) setLeaving(key);
              return;
            }
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
                  size="small"
                  variant="secondary"
                  startIcon="edit"
                  ariaLabel={t('profile.edit.button_label', { field: title })}
                  onClick={() => {
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
                onDirty={setDirty}
                // ticked details are never dropped without a question, by Cancel either
                onCancel={() => (dirty ? setLeaving(current) : setEditing(false))}
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
      <ConfirmDialog
        open={leaving !== null}
        title={t('profile.edit.leave_title')}
        message={t('profile.edit.leave_message')}
        confirmLabel={
          leaving === current ? t('profile.edit.discard_confirm') : t('profile.edit.leave_confirm')
        }
        onConfirm={() => {
          if (leaving) setCurrent(leaving);
          setLeaving(null);
          setEditing(false);
        }}
        onCancel={() => setLeaving(null)}
      />
    </div>
  );
}
