import { Avatar, Badge, ProfileHeader as Banner } from '@css/ui';
import { Ban, CircleCheck, Clock, UserX } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { useFileDataUrl } from '../../components/FileImage';
import { isVolunteerType } from './ProfileDetails';
import type { OwnProfile } from './profile-api';

const STATE = {
  pending: { tone: 'warning', icon: Clock },
  active: { tone: 'success', icon: CircleCheck },
  blocked: { tone: 'danger', icon: Ban },
  deactivated: { tone: 'neutral', icon: UserX },
} as const;

/**
 * The person at the head of the own profile, on the set's dark banner under the page title: the
 * own photo, the name, the state and the volunteer type.
 */
export function ProfileHeader({ me }: { me: OwnProfile }) {
  const t = useTranslations('registration');
  const photo = useFileDataUrl(me.photoFileId);
  const state = STATE[me.state];
  const type = isVolunteerType(me.type) ? t(`form.types.${me.type}`) : me.type;
  return (
    <Banner
      name={me.displayName}
      headingLevel={2}
      avatar={<Avatar name={me.displayName} src={photo.data} size="lg" />}
      status={<Badge tone={state.tone} icon={state.icon} label={t(`profile.state.${me.state}`)} />}
      facts={type ? [{ id: 'type', label: t('form.type'), value: type }] : []}
    />
  );
}
