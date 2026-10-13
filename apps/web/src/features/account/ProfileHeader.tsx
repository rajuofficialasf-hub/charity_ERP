import { VOLUNTEER_TYPES, type VolunteerType } from '@css/shared/registration';
import { Avatar, Badge, Card } from '@css/ui';
import { Ban, CircleCheck, Clock, UserX } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { useFileDataUrl } from '../../components/FileImage';
import type { OwnProfile } from './profile-api';

const STATE = {
  pending: { tone: 'warning', icon: Clock },
  active: { tone: 'success', icon: CircleCheck },
  blocked: { tone: 'danger', icon: Ban },
  deactivated: { tone: 'neutral', icon: UserX },
} as const;

/** The person at the head of the profile: the own photo, the name, the type and the state. */
export function ProfileHeader({ me }: { me: OwnProfile }) {
  const t = useTranslations('registration');
  const photo = useFileDataUrl(me.photoFileId);
  const state = STATE[me.state];
  const type = (VOLUNTEER_TYPES as readonly string[]).includes(me.type)
    ? t(`form.types.${me.type as VolunteerType}`)
    : me.type;
  return (
    <Card>
      <section aria-label={me.displayName} className="profile-head">
        <Avatar name={me.displayName} src={photo.data} size="lg" className="profile-avatar" />
        <div className="profile-who">
          <p className="profile-name">{me.displayName}</p>
          <p className="profile-type">{type}</p>
        </div>
        <Badge tone={state.tone} icon={state.icon} label={t(`profile.state.${me.state}`)} />
      </section>
    </Card>
  );
}
