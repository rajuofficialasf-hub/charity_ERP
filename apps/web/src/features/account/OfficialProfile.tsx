import type { OwnStaffProfile } from '@css/shared/auth';
import {
  Alert,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  LinkButton,
  ProfileBanner,
  type ProfileFact,
  Skeleton,
} from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useFileDataUrl } from '../../components/FileImage';
import { LoadError } from '../../components/LoadError';
import { canSeeProjects } from '../../admin/roles';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  fieldLabelKey,
  fieldsOf,
  FixedRows,
  OFFICIAL_FIELDS,
  OfficialEditSection,
  type OfficialSection,
  OfficialRow,
  OfficialValue,
} from './OfficialDetails';
import { ProfileNav } from './ProfileNav';
import { ProjectsWork } from './ProjectsWork';
import {
  type ChangeRequest,
  OWN_WORK_KEY,
  ownProjectsWork,
  ownRequests,
  ownStaffProfile,
  REQUESTS_KEY,
  STAFF_PROFILE_KEY,
} from './profile-api';

const SECTIONS = [
  { key: 'identity', icon: 'id-card' },
  { key: 'contact', icon: 'phone' },
  { key: 'projects', icon: 'project' },
] as const;
type Section = (typeof SECTIONS)[number]['key'];

const STATE_TONE = {
  pending: 'warning',
  active: 'success',
  blocked: 'error',
  deactivated: 'neutral',
} as const;

const isDetails = (section: Section): section is OfficialSection => section !== 'projects';

/**
 * An official's own profile (docs/DECISION_LOG.md, the official's own profile and the decision
 * that the supervisor is not asked for; docs/ui/SCREENS.md, "My profile"): the banner with the
 * photo or the initial, then one section at a time: who they are and where they work, how they are reached and
 * their account, and the projects they work on by year with the figures of their work. An active
 * official asks for a change of a section's details from its edit button; the Department Head or
 * the Monitoring Team decides.
 */
export function OfficialProfile() {
  const t = useTranslations('registration.profile');
  const profile = useQuery({ queryKey: STAFF_PROFILE_KEY, queryFn: ownStaffProfile, retry: false });
  const requests = useQuery({ queryKey: REQUESTS_KEY, queryFn: ownRequests });
  const [current, setCurrent] = useState<Section>('identity');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [leaving, setLeaving] = useState<Section | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const titleId = useId();
  if (profile.isPending) return <Skeleton count={3} />;
  if (profile.error instanceof ApiFailure && profile.error.status === 404)
    return <EmptyState title={t('official.not_official')} />;
  if (profile.error || !profile.data)
    return <LoadError error={profile.error} onRetry={() => void profile.refetch()} />;
  const me = profile.data;
  const rows = requests.data;
  const edits = (rows ?? []).filter(
    (r) => r.kind === 'profile_edit' && ['open', 'submitted'].includes(r.status),
  );
  // a section with a request waiting for the person (a code or a photo to give) is marked
  const waiting = new Set<Section>(
    (Object.keys(OFFICIAL_FIELDS) as OfficialSection[]).filter((s) =>
      edits.some(
        (r) => r.status === 'open' && (fieldsOf(s) as readonly string[]).includes(r.field),
      ),
    ),
  );
  const title = t(`official.sections.${current}`);
  const canEdit = isDetails(current) && me.state === 'active' && rows !== undefined && !editing;
  return (
    <div className="profile">
      {requests.error && (
        <LoadError error={requests.error} onRetry={() => void requests.refetch()} />
      )}
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      <OfficialBanner me={me} />
      <div className="profile-layout">
        <ProfileNav
          sections={SECTIONS.map((s) => ({
            key: s.key,
            icon: s.icon,
            title: t(`official.sections.${s.key}`),
          }))}
          current={current}
          waiting={waiting}
          busy={busy}
          onSelect={(key) => {
            // ticked details are never dropped without a question
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
              {canEdit && (
                <Button
                  size="small"
                  variant="secondary"
                  startIcon="edit"
                  ariaLabel={t('edit.button_label', { field: title })}
                  onClick={() => {
                    setNotice(null);
                    setEditing(true);
                  }}
                >
                  {t('edit.button')}
                </Button>
              )}
            </div>
            {current === 'projects' ? (
              <OwnProjects />
            ) : editing && rows ? (
              <OfficialEditSection
                key={current}
                me={me}
                title={title}
                fields={fieldsOf(current)}
                edits={edits}
                onBusy={setBusy}
                onDirty={setDirty}
                onCancel={() => setEditing(false)}
                onSent={() => {
                  setEditing(false);
                  setNotice(t('official.sent'));
                }}
              />
            ) : (
              <Details me={me} section={current} edits={edits} />
            )}
          </section>
        </Card>
      </div>
      <ConfirmDialog
        open={leaving !== null}
        title={t('edit.leave_title')}
        message={t('edit.leave_message')}
        confirmLabel={t('edit.leave_confirm')}
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

function OfficialBanner({ me }: { me: OwnStaffProfile }) {
  const t = useTranslations('registration.profile');
  const ts = useTranslations('admin.staff');
  const photo = useFileDataUrl(me.photoFileId);
  const facts: ProfileFact[] = [
    ...(me.designation
      ? [
          {
            id: 'designation',
            label: ts('dialog.designation'),
            value: me.designation,
            icon: 'briefcase' as const,
          },
        ]
      : []),
    ...(me.jobId
      ? [
          {
            id: 'job',
            label: ts('column.job_id'),
            value: me.jobId,
            icon: 'id-card' as const,
            showLabel: true,
            copy: true,
          },
        ]
      : []),
  ];
  return (
    <ProfileBanner
      name={me.displayName}
      headingLevel={2}
      photo={photo.data}
      status={<Chip tone={STATE_TONE[me.state]}>{t(`state.${me.state}`)}</Chip>}
      facts={facts}
    />
  );
}

/** A section's details in view mode: the requestable ones with their requests, then the fixed. */
function Details({
  me,
  section,
  edits,
}: {
  me: OwnStaffProfile;
  section: OfficialSection;
  edits: ChangeRequest[];
}) {
  const t = useTranslations('registration');
  return (
    <>
      <dl className="profile-list">
        {fieldsOf(section).map((field) => {
          const label = t(fieldLabelKey(field));
          return (
            <OfficialRow
              key={field}
              label={label}
              field={field}
              value={<OfficialValue me={me} field={field} label={label} />}
              request={edits.find((r) => r.field === field)}
            />
          );
        })}
        <FixedRows me={me} section={section} />
      </dl>
      {section === 'contact' && <AccountLinks />}
    </>
  );
}

function AccountLinks() {
  const t = useTranslations('registration.profile.official');
  return (
    <div className="profile-links">
      <LinkButton variant="secondary" to="/account/password">
        {t('change_password')}
      </LinkButton>
      <LinkButton variant="secondary" to="/account/sessions">
        {t('devices')}
      </LinkButton>
    </div>
  );
}

function OwnProjects() {
  const { me } = useAuth();
  const work = useQuery({ queryKey: OWN_WORK_KEY, queryFn: ownProjectsWork });
  return <ProjectsWork query={work} own projectLinks={Boolean(me && canSeeProjects(me))} />;
}
