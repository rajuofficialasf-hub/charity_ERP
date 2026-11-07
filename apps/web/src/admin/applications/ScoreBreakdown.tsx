import { MAX_SCORE, NOT_PREVIOUSLY_ASSISTED } from '@css/shared/forms';
import { formatDecimal } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Card, DescriptionList, Text } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import type { ScoreItem } from './applications-api';

/**
 * The priority score of an application for the office: the total beside the most it could reach,
 * and each part with its points. The score helps the decision and never takes it.
 */
export function ScoreBreakdown({ total, items }: { total: number; items: readonly ScoreItem[] }) {
  const t = useTranslations('applications.office.score');
  const locale = useLocale() as Locale;
  const number = (n: number) => formatDecimal(n, 2, locale);
  // the most the parts could give, capped like the score itself
  const max = Math.min(
    MAX_SCORE,
    items.reduce((sum, item) => sum + item.max_points, 0),
  );
  // the form-level criterion is named by the catalogue; every other part by its question
  const nameOf = (item: ScoreItem) =>
    item.key === NOT_PREVIOUSLY_ASSISTED
      ? t('not_previously_assisted')
      : item.label
        ? localized(item.label, locale)
        : item.key;
  return (
    <Card
      title={t('title')}

      headingLevel={2}
    >
      <p className="admin-muted">{t('total', { score: number(total), max: number(max) })}</p>
      <DescriptionList
        items={items.map((item) => ({
          label: nameOf(item),
          value: t('points', { points: number(item.points), max: number(item.max_points) }),
        }))}
      />
      <Text tone="muted">{t('help')}</Text>
    </Card>
  );
}
