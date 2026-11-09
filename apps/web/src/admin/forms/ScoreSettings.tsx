import { type FieldScore, type FormField, scoreKindOf } from '@css/shared/forms';
import { Button, Disclosure, IconButton, Stack, Text } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import { NumberText } from './NumberText';
import { useRowKeys } from '../../lib/use-row-keys';

type Range = NonNullable<FieldScore['ranges']>[number];

/** A points setting with nothing in it is no setting at all, so the draft holds no empty object. */
function scoreOrNone(score: FieldScore): FieldScore | undefined {
  const options =
    score.options && Object.keys(score.options).length ? { options: score.options } : {};
  const ranges = score.ranges?.length ? { ranges: score.ranges } : {};
  const next = { ...options, ...ranges };
  return Object.keys(next).length ? next : undefined;
}

/**
 * The points a question gives toward the priority score, for the Monitoring Team: a box per
 * option of a choice question, or ranges of a number question. A question of another type offers
 * nothing. An emptied box takes the option's points away.
 */
export function ScoreSettings({
  field,
  onChange,
}: {
  field: FormField;
  onChange: (score: FieldScore | undefined) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale() as 'bn' | 'en';
  const kind = scoreKindOf(field.type);
  if (kind === null) return null;
  const score = field.settings?.score ?? {};
  return (
    <Disclosure title={t('score_group')} hint={t('optional')} headingLevel={2}>
      <Stack gap={3}>
        <Text tone="muted">{t('score_hint')}</Text>
        {kind === 'options' ? (
          (field.options ?? []).map((option) => (
            <NumberText
              key={option.code}
              label={t('score_option', { option: option.label[locale] })}
              integer
              value={score.options?.[option.code]}
              onChange={(points) => {
                const options = { ...score.options };
                if (points === undefined) delete options[option.code];
                else options[option.code] = points;
                onChange(scoreOrNone({ options }));
              }}
            />
          ))
        ) : (
          <Ranges
            ranges={score.ranges ?? []}
            onChange={(ranges) => onChange(scoreOrNone({ ranges }))}
          />
        )}
      </Stack>
    </Disclosure>
  );
}

/** The ranges of a number question, each with its bounds and its points. */
function Ranges({
  ranges,
  onChange,
}: {
  ranges: readonly Range[];
  onChange: (ranges: Range[]) => void;
}) {
  const t = useTranslations('forms.builder');
  const keys = useRowKeys(ranges.length);
  const set = (index: number, next: Partial<Range>) =>
    onChange(
      ranges.map((r, i) => {
        if (i !== index) return r;
        const merged = { ...r, ...next };
        return {
          ...(merged.min === undefined ? {} : { min: merged.min }),
          ...(merged.max === undefined ? {} : { max: merged.max }),
          points: merged.points,
        };
      }),
    );
  return (
    <Stack gap={2}>
      <Text tone="muted">{t('score_ranges_hint')}</Text>
      <ul className="fb-score-ranges" aria-label={t('score_ranges')}>
        {ranges.map((range, i) => (
          <li key={keys.keys[i]} className="fb-score-range">
            <NumberText
              label={t('score_range_min')}
              value={range.min}
              onChange={(min) => set(i, { min })}
            />
            <NumberText
              label={t('score_range_max')}
              value={range.max}
              error={
                range.min !== undefined && range.max !== undefined && range.min > range.max
                  ? t('limits_order')
                  : undefined
              }
              onChange={(max) => set(i, { max })}
            />
            <NumberText
              label={t('score_range_points')}
              integer
              value={range.points}
              onChange={(points) => set(i, { points: points ?? 0 })}
            />
            <IconButton
              label={t('score_range_remove')}
              icon="close"
              onClick={() => {
                keys.remove(i);
                onChange(ranges.filter((_, j) => j !== i));
              }}
            />
          </li>
        ))}
      </ul>
      <div>
        <Button
          variant="secondary"
          size="small"
          startIcon="add"
          onClick={() => onChange([...ranges, { points: 0 }])}
        >
          {t('score_range_add')}
        </Button>
      </div>
    </Stack>
  );
}
