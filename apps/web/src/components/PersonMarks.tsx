import { Chip } from '@/ui';
import { useTranslations } from 'use-intl';

/** The mark of a person whose profile holds no identity document. */
export function NoDocumentChip() {
  const t = useTranslations('common.person');
  return <Chip tone="warning">{t('no_document')}</Chip>;
}

/**
 * What stands in the place of a mobile number for a person who has none of their own: the
 * volunteer of the application is the way to reach them.
 */
export function ThroughVolunteerChip() {
  const t = useTranslations('common.person');
  return <Chip tone="info">{t('through_volunteer')}</Chip>;
}
