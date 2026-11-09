import { Chip, Icon, ProfileBanner } from '@/ui';
import { useTranslations } from 'use-intl';
import { useFileDataUrl } from '../../components/FileImage';
import { isVolunteerType } from './ProfileDetails';
import type { OwnProfile } from './profile-api';

const STATE = {
  pending: { tone: 'warning', icon: 'clock' },
  active: { tone: 'success', icon: 'success' },
  blocked: { tone: 'error', icon: 'block' },
  deactivated: { tone: 'neutral', icon: 'user-block' },
} as const;

/**
 * The person at the head of the own profile, on the profile banner under the page title: the
 * own photo, the name, the state and the volunteer type.
 */
export function ProfileHeader({ me }: { me: OwnProfile }) {
  const t = useTranslations('registration');
  const photo = useFileDataUrl(me.photoFileId);
  const state = STATE[me.state];
  const type = isVolunteerType(me.type) ? t(`form.types.${me.type}`) : me.type;
  return (
    <ProfileBanner
      name={me.displayName}
      headingLevel={2}
      photo={photo.data}
      status={
        <Chip tone={state.tone}>
          <Icon name={state.icon} size={16} />
          {t(`profile.state.${me.state}`)}
        </Chip>
      }
      facts={type ? [{ id: 'type', label: t('form.type'), value: type, showLabel: true }] : []}
    />
  );
}
