import { Chip } from '@/ui';
import { useTranslations } from 'use-intl';
import { useMediaLabels } from '../../features/media/use-media-lists';
import type { OfficeApplication } from './applications-api';

/**
 * The application's media state beside its own state: the work's stage once there is one (on the
 * record; a list row knows the referral's state alone).
 */
export function MediaBadge({
  media,
}: {
  media: Pick<NonNullable<OfficeApplication['media']>, 'state'> & { workStageCode?: string | null };
}) {
  const t = useTranslations('media');
  const labels = useMediaLabels();
  const tone =
    media.state === 'rejected' ? 'neutral' : media.state === 'sent_back' ? 'warning' : 'info';
  return (
    <Chip tone={tone}>
      {media.workStageCode
        ? t('referral.badge_stage', { stage: labels.stage(media.workStageCode) })
        : t('referral.badge', { state: t(`state.${media.state}`) })}
    </Chip>
  );
}
