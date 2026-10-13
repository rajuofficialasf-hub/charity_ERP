import { VOLUNTEER_TYPES, type VolunteerType } from '@css/shared/registration';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { Clock, PencilLine } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { AddressNames } from '../../components/AddressNames';
import { DocumentTitle } from '../../components/DocumentTitle';
import { FileImage } from '../../components/FileImage';
import { ApiFailure } from '../../lib/api';
import { Corrections, EditDialog, RequestState } from './ChangeRequests';
import {
  type ChangeRequest,
  FIELD_LABEL,
  ownProfile,
  ownRequests,
  type OwnProfile,
  PROFILE_KEY,
  REQUESTS_KEY,
  type RequestField,
} from './profile-api';
import './profile.css';

const isVolunteerType = (type: string): type is VolunteerType =>
  (VOLUNTEER_TYPES as readonly string[]).includes(type);

/** The own details by section (UX-18); the type decides the role, so it has no edit button. */
const SECTIONS: { key: string; fields: (RequestField | 'type')[] }[] = [
  { key: 'personal', fields: ['name', 'fatherName', 'motherName', 'nid'] },
  { key: 'contact', fields: ['mobile', 'email', 'whatsapp', 'facebookId'] },
  { key: 'address', fields: ['address', 'addressLine'] },
  {
    key: 'work',
    fields: ['type', 'education', 'experience', 'workDescription', 'previousProjects'],
  },
  { key: 'bank', fields: ['bank'] },
  { key: 'photos', fields: ['photo', 'nid_photo', 'nid_photo_back'] },
];

/**
 * The volunteer's own profile (SCR-006, SCR-003; BR-030, BR-031 as amended by DECISION_LOG D-085;
 * plan docs/plans/2026-10-13-0922-feat-registration-redesign-plan.md, R12, R13): the own details
 * in full, arranged by section; after approval an edit button beside each detail sends the change
 * request, and a detail with an open request shows its state there. A pending registrant sees the
 * requested corrections above the details.
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
  const [editing, setEditing] = useState<RequestField | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
  const openEdit = (field: string) =>
    rows?.find(
      (r) =>
        r.kind === 'profile_edit' && r.field === field && ['open', 'submitted'].includes(r.status),
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
      {SECTIONS.map((section) => (
        <Section key={section.key} title={t(`profile.sections.${section.key as 'personal'}`)}>
          {section.fields.map((field) => (
            <Detail
              key={field}
              me={me}
              field={field}
              request={field === 'type' ? undefined : openEdit(field)}
              canEdit={active && field !== 'type' && rows !== undefined}
              onEdit={() => field !== 'type' && setEditing(field)}
            />
          ))}
        </Section>
      ))}
      {editing && (
        <EditDialog
          field={editing}
          onClose={() => setEditing(null)}
          onSent={() => {
            setEditing(null);
            setNotice(t('profile.edit.sent'));
          }}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <Card>
      <section aria-labelledby={id} className="profile-section">
        <h2 id={id} className="profile-section-title">
          {title}
        </h2>
        <dl className="profile-list">{children}</dl>
      </section>
    </Card>
  );
}

function Detail({
  me,
  field,
  request,
  canEdit,
  onEdit,
}: {
  me: OwnProfile;
  field: RequestField | 'type';
  request?: ChangeRequest;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations('registration');
  const label = field === 'type' ? t('form.type') : t(FIELD_LABEL[field]);
  const waiting = request?.status === 'open';
  return (
    <div className="profile-row">
      <dt className="profile-label">{label}</dt>
      <dd className="profile-value">
        <div className="profile-text">
          <Value me={me} field={field} label={label} />
        </div>
        <div className="profile-action">
          {request ? (
            <Badge
              size="sm"
              tone={waiting ? 'warning' : 'info'}
              icon={Clock}
              label={t(waiting ? 'profile.edit.status.open' : 'profile.edit.status.submitted')}
            />
          ) : (
            canEdit && (
              <Button
                size="sm"
                variant="ghost"
                icon={PencilLine}
                aria-label={t('profile.edit.button_label', { field: label })}
                onPress={onEdit}
              >
                {t('profile.edit.button')}
              </Button>
            )
          )}
        </div>
        {request && waiting && field !== 'type' && (
          <div className="profile-request">
            <RequestState row={request} field={field} label={label} />
          </div>
        )}
      </dd>
    </div>
  );
}

const PHOTO_ID = {
  photo: 'photoFileId',
  nid_photo: 'nidPhotoFileId',
  nid_photo_back: 'nidPhotoBackFileId',
} as const;

function Value({
  me,
  field,
  label,
}: {
  me: OwnProfile;
  field: RequestField | 'type';
  label: string;
}) {
  const t = useTranslations('registration');
  const empty = <span className="profile-empty">{t('profile.empty')}</span>;
  switch (field) {
    case 'type':
      return <>{isVolunteerType(me.type) ? t(`form.types.${me.type}`) : me.type}</>;
    case 'name':
      return <>{me.displayName}</>;
    case 'address':
      return <AddressNames address={me} />;
    case 'bank': {
      const bank = [
        me.bank.bankName,
        me.bank.accountName,
        me.bank.accountNumber,
        me.bank.routingNumber,
      ]
        .filter(Boolean)
        .join(', ');
      return bank ? <>{bank}</> : empty;
    }
    case 'photo':
    case 'nid_photo':
    case 'nid_photo_back': {
      const id = me[PHOTO_ID[field]];
      return id ? <FileImage fileId={id} alt={label} /> : empty;
    }
    default: {
      const value = me[field];
      return typeof value === 'string' && value ? <>{value}</> : empty;
    }
  }
}
