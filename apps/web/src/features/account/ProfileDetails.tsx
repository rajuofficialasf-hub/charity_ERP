import { VOLUNTEER_TYPES, type VolunteerType } from '@css/shared/registration';
import { formatDate } from '@css/shared/format';
import { isFacebookLink } from '@css/shared/registration';
import { Chip, Icon } from '@/ui';
import { useTranslations } from 'use-intl';
import { AddressNames } from '../../components/AddressNames';
import { RequestState } from './ChangeRequests';
import { EducationText, PermanentAddressText, ProfessionText, SkillsText } from './DetailValues';
import { type ChangeRequest, FIELD_LABEL, type OwnProfile, type RequestField } from './profile-api';
import { OpenablePhoto } from '../photos/OpenablePhoto';

/** A detail of the profile: the editable fields of a request, and the type (no request). */
export type ProfileField = RequestField | 'type';

export const labelKey = (field: ProfileField) =>
  field === 'type' ? ('form.type' as const) : FIELD_LABEL[field];

export const isVolunteerType = (type: string): type is VolunteerType =>
  (VOLUNTEER_TYPES as readonly string[]).includes(type);

const PHOTO_ID = {
  photo: 'photoFileId',
  nid_photo: 'nidPhotoFileId',
  nid_photo_back: 'nidPhotoBackFileId',
} as const;

/** The state of an open or submitted request beside its detail. */
export function RequestBadge({ request }: { request: ChangeRequest }) {
  const t = useTranslations('registration.profile.edit.status');
  const waiting = request.status === 'open';
  return (
    <Chip tone={waiting ? 'warning' : 'info'}>
      <Icon name="clock" size={16} />
      {t(waiting ? 'open' : 'submitted')}
    </Chip>
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
    case 'dateOfBirth':
      return me.dateOfBirth ? <>{formatDate(me.dateOfBirth)}</> : empty;
    case 'volunteeringArea':
      return me.volunteeringArea ? (
        <>
          {t(
            `lists.volunteering_area.${me.volunteeringArea}` as 'lists.volunteering_area.anywhere',
          )}
        </>
      ) : (
        empty
      );
    case 'profession':
      return <ProfessionText profession={me.profession} details={me.professionDetails} />;
    case 'skills':
      return (
        <SkillsText
          interestAreas={me.interestAreas}
          vehicle={me.vehicle}
          canSwim={me.canSwim}
          availability={me.availability}
          emergencyFullTime={me.emergencyFullTime}
        />
      );
    case 'educationDetails':
      return <EducationText education={me.educationDetails} />;
    case 'permanentAddress':
      return <PermanentAddressText address={me.permanentAddress} />;
    case 'facebookId': {
      const link = me.facebookId?.trim();
      if (!link) return empty;
      // a link only when it passes the shared check; an older plain id stays text
      return isFacebookLink(link) ? (
        <a href={link} target="_blank" rel="noopener noreferrer nofollow">
          {link}
        </a>
      ) : (
        <>{link}</>
      );
    }
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
      return id ? <OpenablePhoto photos={[{ fileId: id, alt: label }]} index={0} /> : empty;
    }
    default: {
      const value = me[field];
      return typeof value === 'string' && value ? <>{value}</> : empty;
    }
  }
}

/** The earlier texts: shown (and asked for) only for a volunteer who has them. */
export const LEGACY_FIELDS: readonly ProfileField[] = [
  'education',
  'experience',
  'workDescription',
  'previousProjects',
];
export const hasValue = (me: OwnProfile, field: ProfileField): boolean => {
  const value = field === 'type' ? me.type : me[field as keyof OwnProfile];
  return typeof value === 'string' ? value !== '' : value !== null && value !== undefined;
};
