import { VOLUNTEER_TYPES, type VolunteerType } from '@css/shared/registration';
import { Badge } from '@css/ui';
import { Clock } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { AddressNames } from '../../components/AddressNames';
import { FileImage } from '../../components/FileImage';
import { RequestState } from './ChangeRequests';
import { type ChangeRequest, FIELD_LABEL, type OwnProfile, type RequestField } from './profile-api';

/** A detail of the profile: the editable fields of a request, and the type (no request). */
export type ProfileField = RequestField | 'type';

export const labelKey = (field: ProfileField) =>
  field === 'type' ? ('form.type' as const) : FIELD_LABEL[field];

const isVolunteerType = (type: string): type is VolunteerType =>
  (VOLUNTEER_TYPES as readonly string[]).includes(type);

const PHOTO_ID = {
  photo: 'photoFileId',
  nid_photo: 'nidPhotoFileId',
  nid_photo_back: 'nidPhotoBackFileId',
} as const;

/** The state of an open or submitted request beside its detail (BR-031, D-085). */
export function RequestBadge({ request }: { request: ChangeRequest }) {
  const t = useTranslations('registration.profile.edit.status');
  const waiting = request.status === 'open';
  return (
    <Badge
      size="sm"
      tone={waiting ? 'warning' : 'info'}
      icon={Clock}
      label={t(waiting ? 'open' : 'submitted')}
    />
  );
}

/** One detail in view mode: label, value and the state of its request, if there is one. */
export function DetailRow({
  me,
  field,
  request,
}: {
  me: OwnProfile;
  field: ProfileField;
  request?: ChangeRequest;
}) {
  const t = useTranslations('registration');
  const label = t(labelKey(field));
  return (
    <div className="profile-row">
      <dt className="profile-label">{label}</dt>
      <dd className="profile-value">
        <div className="profile-text">
          <Value me={me} field={field} label={label} />
        </div>
        {request && (
          <div className="profile-action">
            <RequestBadge request={request} />
          </div>
        )}
        {request?.status === 'open' && field !== 'type' && (
          <div className="profile-request">
            <RequestState row={request} field={field} label={label} />
          </div>
        )}
      </dd>
    </div>
  );
}

/** The current value of a detail as the person gave it (photos are streamed, the address named). */
export function Value({
  me,
  field,
  label,
}: {
  me: OwnProfile;
  field: ProfileField;
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
        me.bank.branchName,
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
